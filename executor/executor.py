import os
import io
import uuid
import json
import tempfile
import logging
from typing import List, Dict, Any

from fastapi import FastAPI, HTTPException, Body
from pydantic import BaseModel
from google.cloud import storage
from cryptography.hazmat.primitives.asymmetric import rsa, padding
from cryptography.hazmat.primitives import serialization, hashes
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
import nbformat
import papermill as pm
from collections import defaultdict
import threading, time
from google.oauth2 import service_account

# ---------- Configuration ----------
RESULTS_BUCKET = os.environ.get("RESULTS_BUCKET", "yellowsense-technologies-cleanroom")
# Optionally restrict allowed GCS buckets/prefixes for security
ALLOWED_SOURCE_BUCKETS = None  # set to list like ["client-a-bucket", "client-b-bucket"] if desired

# ---------------------------LOCAL TESTING CONFIG---------------------------
# SA_KEY_PATH = os.path.join(os.path.dirname(__file__), "yellowsense-technologies-17f4c4e3ed2c.json")
SA_KEY_PATH = r"..\orchestrator\yellowsense-technologies-17f4c4e3ed2c.json"
creds = service_account.Credentials.from_service_account_file(SA_KEY_PATH)
# Use these credentials when creating GCS clients
storage_client = storage.Client(credentials=creds)
# --------------------------------------------------------------------------

# ---------- Logging ----------
logging.basicConfig(level=logging.INFO)
log = logging.getLogger("tee-executor")

# Store logs in memory: { workflow_id: [log lines] }
WORKFLOW_LOGS = defaultdict(list)
LOG_LOCK = threading.Lock()

def append_log(workflow_id, msg):
    with LOG_LOCK:
        WORKFLOW_LOGS[workflow_id].append(msg)
    log.info(msg)  # still send to console

def tail_pm_logs(log_file, workflow_id):
    """ Continuously read papermill logs while notebook executes. """
    try:
        with open(log_file, "r") as f:
            f.seek(0, io.SEEK_END)  # Start from end of file
            while True:
                line = f.readline()
                if line:
                    append_log(workflow_id, f"[pm] {line.strip()}")
                else:
                    time.sleep(0.5)
    except Exception as e:
        append_log(workflow_id, f"[pm-logger-error] {e}")

# ---------- FastAPI app ----------
app = FastAPI(title="TEE Executor (Confidential VM)")

# ---------- Generate ephemeral RSA keypair (in-memory only) ----------
# NOTE: this keypair should be generated on startup and private key must never be written to disk.
_priv_key = rsa.generate_private_key(public_exponent=65537, key_size=3072)
_pub_pem = _priv_key.public_key().public_bytes(
    encoding=serialization.Encoding.PEM,
    format=serialization.PublicFormat.SubjectPublicKeyInfo,
).decode("utf-8")


# ---------- Storage client ----------
# storage_client = storage.Client()


# ---------- Pydantic models ----------
class DatasetSpec(BaseModel):
    owner: str
    ciphertext_gcs: str           # gs://bucket/path/to/ciphertext (nonce||ciphertext format)
    wrapped_dek_gcs: str          # gs://bucket/path/to/wrapped_dek (bytes)

class ExecuteRequest(BaseModel):
    workflow_id: str
    workload_gcs: str             # gs://bucket/path/to/original_workload.ipynb
    datasets: List[DatasetSpec]   # list of datasets (owner + ciphertext + wrapped dek)
    result_base: str              # gs://bucket/results/<workflow_id>/result  (no extension)
    executed_notebook_base: str   # gs://bucket/results/<workflow_id>/executed  (no extension)



# ---------- Utility helpers ----------
def parse_gs_uri(gs_uri: str):
    if not gs_uri.startswith("gs://"):
        raise ValueError("GCS URI must start with gs://")
    rest = gs_uri[5:]
    parts = rest.split("/", 1)
    if len(parts) == 1:
        bucket, obj = parts[0], ""
    else:
        bucket, obj = parts
    return bucket, obj

def download_blob_bytes(gs_uri: str) -> bytes:
    bucket, obj = parse_gs_uri(gs_uri)
    if ALLOWED_SOURCE_BUCKETS and bucket not in ALLOWED_SOURCE_BUCKETS:
        raise HTTPException(status_code=403, detail=f"Bucket {bucket} not allowed")
    b = storage_client.bucket(bucket).blob(obj)
    data = b.download_as_bytes()
    return data

def upload_blob_from_file(gs_uri: str, local_path: str):
    bucket, obj = parse_gs_uri(gs_uri)
    blob = storage_client.bucket(bucket).blob(obj)
    blob.upload_from_filename(local_path)
    return f"gs://{bucket}/{obj}"

# def list_result_blob_under_prefix(result_base: str):
#     # result_base is gs://bucket/path/to/result (no extension)
#     bucket, prefix = parse_gs_uri(result_base)
#     # prefix may be like results/<workflow>/result
#     # we'll look for all objects that start with prefix
#     blobs = list(storage_client.bucket(bucket).list_blobs(prefix=os.path.dirname(prefix)))
#     # choose those that match the result_base prefix (start with the base name)
#     base_name = os.path.basename(prefix)
#     candidates = [b for b in blobs if os.path.basename(b.name).startswith(base_name)]
#     return candidates

def list_result_blob_under_prefix(result_base: str):
    """
    Correctly lists all result blobs uploaded by the notebook.
    The notebook uploader puts files *under* the result_base prefix.
    """
    bucket, prefix = parse_gs_uri(result_base)
    # The prefix is now the "folder" where results are, e.g., "results/<workflow_id>/result/"
    # We list all blobs within that prefix.
    blobs = list(storage_client.bucket(bucket).list_blobs(prefix=prefix))
    
    # Return all candidates found under the prefix.
    # We filter out any potential "directory placeholder" objects if they exist.
    candidates = [b for b in blobs if not b.name.endswith('/')]
    return candidates

# ---------- Attestation endpoint ----------
@app.get("/attestation")
def get_attestation():
    """
    Return the enclave public key and an attestation token / evidence proving that this
    public key is bound to a genuine Confidential VM / enclave.

    NOTE (IMPORTANT):
      - In production you must call the cloud provider's attestation API and include the
        public key (or a hash/nonce of it) in the attestation evidence so clients can
        verify the attestation and trust this public key.
      - On GCP: use the Confidential Computing attestation APIs to obtain a signed token
        that includes the public_key binding. Insert that token below.

    This implementation returns the public key and a placeholder attestation token. Replace
    `get_attestation_token()` with a proper implementation (see comments in function).
    """
    att_token = get_attestation_token(pub_pem=_pub_pem)
    return {"public_key_pem": _pub_pem, "attestation_token": att_token}


def get_attestation_token(pub_pem: str) -> str:
    """
    TODO: Implement real attestation token retrieval here.

    On GCP this would:
      - call the Confidential Computing attestation API (or the metadata/service endpoint)
      - request an attestation token that includes/verifiably binds pub_pem (for example via the nonce)
      - return the token (JWT or binary) that clients can verify against Google's attestation verifier.

    For now this returns a minimal JSON string that clients can inspect. Replace with a
    real attestation token when running on a Confidential VM.
    """
    # Example of what to include: { "note": "REPLACE_WITH_REAL_ATTESTATION", "pub_key_sha256": "..." }
    import hashlib, base64
    pub_hash = hashlib.sha256(pub_pem.encode("utf-8")).digest()
    pub_hash_b64 = base64.b64encode(pub_hash).decode("utf-8")
    fake_token = json.dumps({
        "note": "INSECURE-PLACEHOLDER-DO-NOT-TRUST - replace with real attestation token",
        "pub_key_sha256_b64": pub_hash_b64
    })
    return fake_token


# Updated 'execute' function with os.chdir()
@app.post("/execute")
def execute(req: ExecuteRequest = Body(...)):
    """
    Main execution API. Expects:
      - datasets: list of DatasetSpec (each owner may contribute multiple datasets)
      - result_base: gs://bucket/results/<workflow_id>/result
      - executed_notebook_base: gs://bucket/results/<workflow_id>/executed
    NOTE: workload is now fixed (bundled inside the executor).
    """
    workflow_id = req.workflow_id
    log.info(f"Starting execution for workflow {workflow_id}")
    append_log(workflow_id, f"Starting execution for workflow {workflow_id}")

    # 1) create working directory
    workdir = tempfile.mkdtemp(prefix=f"wf_{workflow_id}_")
    log.info(f"Workdir: {workdir}")
    append_log(workflow_id, f"Workdir: {workdir}")

    # Store the original working directory
    original_cwd = os.getcwd()

    try:
        # Change the working directory so the notebook can find the files
        os.chdir(workdir)

        # 2) download fixed workload from GCS into workdir
        fixed_workload_gcs = "gs://yellowsense-technologies-cleanroom/workloads/fraud-detector.ipynb"
        bucket, obj = parse_gs_uri(fixed_workload_gcs)
        workload_local = os.path.join(workdir, "fraud-detector.ipynb")
        storage_client.bucket(bucket).blob(obj).download_to_filename(workload_local)

        log.info(f"Downloaded fixed workload to {workload_local}")
        append_log(workflow_id, f"Downloaded fixed workload to {workload_local}")
        
        # 3) decrypt all datasets
        plaintext_paths = {}
        for ds in req.datasets:
            owner = ds.owner
            log.info(f"Processing dataset for owner={owner}")
            append_log(workflow_id, f"Processing dataset for owner={owner}")
            wrapped_dek_bytes = download_blob_bytes(ds.wrapped_dek_gcs)
            ciphertext_bytes = download_blob_bytes(ds.ciphertext_gcs)

            # unwrap DEK
            dek = _priv_key.decrypt(
                wrapped_dek_bytes,
                padding.OAEP(mgf=padding.MGF1(algorithm=hashes.SHA256()), algorithm=hashes.SHA256(), label=None)
            )

            # AES-GCM decrypt
            nonce, ct = ciphertext_bytes[:12], ciphertext_bytes[12:]
            aesgcm = AESGCM(dek)
            plaintext = aesgcm.decrypt(nonce, ct, None)

            # get original filename from GCS object path
            _, obj_path = parse_gs_uri(ds.ciphertext_gcs)
            filename = os.path.basename(obj_path)  # preserve "my_data.csv"

            # write plaintext directly into workdir (same folder as workload)
            # The files are now saved in the new CWD
            local_path = filename
            with open(local_path, "wb") as f:
                f.write(plaintext)

            # store paths grouped by owner
            plaintext_paths.setdefault(owner, []).append(local_path)
            log.info(f"Wrote plaintext dataset for {owner} to {local_path}")

        # 4) inject parameters & result uploader
        # Note: The paths injected are now relative to the workdir, which is the CWD.
        prepared_nb_path = os.path.join(workdir, "prepared_workload.ipynb")
        inject_params_and_result_uploader(
            input_nb=workload_local,
            output_nb=prepared_nb_path,
            dataset_local_paths=plaintext_paths,
            result_base=req.result_base
        )
        log.info("Prepared notebook with injected parameters + uploader")

        # 5) execute notebook with papermill (kernel_name=None runs in-process)
        executed_nb_local = "executed.ipynb" # path is relative now
        stdout_log = "pm_output.log" # path is relative now
        
        # Ensure the log file exists before tailing
        open(stdout_log, "w").close()

        # Start background thread to stream logs
        threading.Thread(
            target=tail_pm_logs,
            args=(stdout_log, workflow_id),
            daemon=True
        ).start()

        log.info("Executing notebook (this runs inside the TEE process)")

        # Open log file handle and stream papermill output into it
        with open(stdout_log, "w", buffering=1, encoding="utf-8") as stdout_f:
            pm.execute_notebook(
                input_path=prepared_nb_path,
                output_path=executed_nb_local,
                kernel_name="python3",
                stdout_file=stdout_f,  # file handle instead of string path
            )
        
        log.info("Notebook executed")
        append_log(workflow_id, "Notebook executed")

        # 6) upload executed notebook
        executed_target = req.executed_notebook_base + ".ipynb"
        upload_blob_from_file(executed_target, executed_nb_local)
        log.info(f"Uploaded executed notebook to {executed_target}")

        # 7) locate result.* file
        # candidates = list_result_blob_under_prefix(req.result_base)
        # if not candidates:
        #     raise HTTPException(status_code=500, detail="No result file found in results prefix after execution")

        # chosen = next(
        #     (b for b in candidates if os.path.basename(b.name).startswith(os.path.basename(parse_gs_uri(req.result_base)[1]))),
        #     None
        # )
        # if not chosen:
        #     raise HTTPException(status_code=500, detail="No matching result file found")

        # result_gcs_path = f"gs://{chosen.bucket.name}/{chosen.name}"
        # ext = os.path.splitext(chosen.name)[1].lstrip(".")

        # return {
        #     "status": "success",
        #     "workflow_id": workflow_id,
        #     "executed_notebook_path": executed_target,
        #     "result_path": result_gcs_path,
        #     "format": ext
        # }

        candidates = list_result_blob_under_prefix(req.result_base)
        if not candidates:
            append_log(workflow_id, "Execution finished, but no result files were found in the 'results/' output directory.")
            raise HTTPException(status_code=500, detail="Notebook executed, but no result files were uploaded.")

        # Create a list of all found GCS paths
        result_gcs_paths = [f"gs://{blob.bucket.name}/{blob.name}" for blob in candidates]
        log.info(f"Found {len(result_gcs_paths)} result file(s): {result_gcs_paths}")
        append_log(workflow_id, f"Found {len(result_gcs_paths)} result file(s).")

        return {
            "status": "success",
            "workflow_id": workflow_id,
            "executed_notebook_path": executed_target,
            "result_paths": result_gcs_paths  # <-- Key is now plural: "result_paths"
        }

    except Exception as e:
        log.exception("Execution failed")
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        try:
            # Change back to the original working directory
            os.chdir(original_cwd)
            for root, _, files in os.walk(workdir):
                for name in files:
                    os.remove(os.path.join(root, name))
            os.rmdir(workdir)
        except Exception:
            pass

def inject_params_and_result_uploader(input_nb: str, output_nb: str,
                                      dataset_local_paths: List[str], result_base: str):
    """
    Reads input notebook, injects a parameters cell and a result uploader cell.
    Ensures a `model/` folder is created for trained models.
    """
    nb = nbformat.read(input_nb, as_version=4)

    # Parameters cell
    dataset_list_py = "[" + ", ".join([f'r"{p}"' for p in dataset_local_paths]) + "]"
    params_source = f'''# Parameters
client_local_paths = {dataset_list_py}
result_base = r"{result_base}"

SA_KEY_PATH = f"{SA_KEY_PATH}"

# Ensure a model directory exists for saving artifacts
import os
os.makedirs("results", exist_ok=True)
os.makedirs("model", exist_ok=True)
'''
    params_cell = nbformat.v4.new_code_cell(source=params_source)
    params_cell.metadata["tags"] = ["parameters"]
    nb.cells.insert(0, params_cell)

    # Uploader cell
    uploader_source = r'''
# Dynamic result uploader injected by executor (DO NOT MODIFY)
import os, shutil
from google.cloud import storage
from google.oauth2 import service_account

# storage_client = storage.Client()

if os.path.exists(SA_KEY_PATH):
    creds = service_account.Credentials.from_service_account_file(SA_KEY_PATH)
    storage_client = storage.Client(credentials=creds)
else:
    storage_client = storage.Client()  # fallback to default

bucket_name, blob_path = result_base[5:].split("/", 1)
bucket = storage_client.bucket(bucket_name)

# ---- Upload everything inside results/ ----
results_dir = "results"
if os.path.isdir(results_dir):
    uploaded_files = []
    for root, _, files in os.walk(results_dir):
        for fname in files:
            local_path = os.path.join(root, fname)
            rel_path = os.path.relpath(local_path, results_dir)
            gcs_target = result_base.rstrip("/") + "/" + rel_path.replace("\\", "/")
            bucket.blob(gcs_target[5 + len(bucket_name) + 1:]).upload_from_filename(local_path)
            uploaded_files.append(gcs_target)
            print(f"Uploaded {local_path} → {gcs_target}")
    if not uploaded_files:
        print("No files found inside results/ directory.")
else:
    print("No results/ directory found; skipping upload.")

# ---- Upload trained model as zip ----
model_dir = "model"
if os.path.isdir(model_dir) and os.listdir(model_dir):  # only if not empty
    zip_name = "trained_model.zip"
    shutil.make_archive("trained_model", "zip", model_dir)
    gcs_model = result_base + "_model.zip"
    bucket.blob(blob_path + "_model.zip").upload_from_filename(zip_name)
    print(f"Uploaded model zip to {gcs_model}")
else:
    print("No model artifacts found to upload.")
'''
    uploader_cell = nbformat.v4.new_code_cell(source=uploader_source)
    nb.cells.append(uploader_cell)

    with open(output_nb, "w", encoding="utf-8") as f:
        nbformat.write(nb, f)

# Add this endpoint to executor.py
@app.get("/logs/{workflow_id}")
def get_workflow_logs(workflow_id: str):
    with LOG_LOCK:
        logs = WORKFLOW_LOGS.get(workflow_id, [])
    return {"logs": logs}

# ---------- Run server ----------
if __name__ == "__main__":
    import uvicorn
    uvicorn.run("executor:app", host="0.0.0.0", port=8443, log_level="info")
