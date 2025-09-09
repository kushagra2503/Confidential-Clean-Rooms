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

# ---------- Configuration ----------
RESULTS_BUCKET = os.environ.get("RESULTS_BUCKET", "clean-room-exp-cleanroom-demo")
# Optionally restrict allowed GCS buckets/prefixes for security
ALLOWED_SOURCE_BUCKETS = None  # set to list like ["client-a-bucket", "client-b-bucket"] if desired

# ---------- Logging ----------
logging.basicConfig(level=logging.INFO)
log = logging.getLogger("tee-executor")

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
storage_client = storage.Client()


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

def list_result_blob_under_prefix(result_base: str):
    # result_base is gs://bucket/path/to/result (no extension)
    bucket, prefix = parse_gs_uri(result_base)
    # prefix may be like results/<workflow>/result
    # we'll look for all objects that start with prefix
    blobs = list(storage_client.bucket(bucket).list_blobs(prefix=os.path.dirname(prefix)))
    # choose those that match the result_base prefix (start with the base name)
    base_name = os.path.basename(prefix)
    candidates = [b for b in blobs if os.path.basename(b.name).startswith(base_name)]
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


# ---------- Core execution endpoint ----------
@app.post("/execute")
def execute(req: ExecuteRequest = Body(...)):
    """
    Main execution API. Expects:
      - workload_gcs: path to uploaded notebooks (original user notebook)
      - datasets: list of DatasetSpec, each containing ciphertext and wrapped DEK GCS paths
      - result_base: a GCS prefix (no extension) where result.* should be uploaded
      - executed_notebook_base: a GCS prefix base to store executed notebook (no extension)
    """
    workflow_id = req.workflow_id
    log.info(f"Starting execution for workflow {workflow_id}")

    # 1) create working directory
    workdir = tempfile.mkdtemp(prefix=f"wf_{workflow_id}_")
    log.info(f"Workdir: {workdir}")

    try:
        # 2) download workload notebook
        bucket, obj = parse_gs_uri(req.workload_gcs)
        workload_local = os.path.join(workdir, "workload.ipynb")
        storage_client.bucket(bucket).blob(obj).download_to_filename(workload_local)
        log.info("Downloaded workload notebook")

        # 3) for each dataset: download wrapped_dek & ciphertext, unwrap, decrypt and write plaintext file
        plaintext_paths = []
        for ds in req.datasets:
            owner = ds.owner
            log.info(f"Processing dataset of owner={owner}")
            wrapped_dek_bytes = download_blob_bytes(ds.wrapped_dek_gcs)
            ciphertext_bytes = download_blob_bytes(ds.ciphertext_gcs)

            # unwrap dek using private key (RSA-OAEP)
            try:
                dek = _priv_key.decrypt(
                    wrapped_dek_bytes,
                    padding.OAEP(mgf=padding.MGF1(algorithm=hashes.SHA256()), algorithm=hashes.SHA256(), label=None)
                )
            except Exception as e:
                log.exception("Failed to unwrap DEK")
                raise HTTPException(status_code=500, detail=f"Failed to unwrap DEK for {owner}: {e}")

            # decrypt AES-GCM (we expect nonce||ciphertext stored by client)
            if len(ciphertext_bytes) < 12:
                raise HTTPException(status_code=400, detail="ciphertext too short (expected nonce+ct)")

            nonce = ciphertext_bytes[:12]
            ct = ciphertext_bytes[12:]
            aesgcm = AESGCM(dek)
            try:
                plaintext = aesgcm.decrypt(nonce, ct, None)
            except Exception as e:
                log.exception("AES-GCM decrypt failed")
                raise HTTPException(status_code=500, detail=f"AES-GCM decrypt failed for {owner}: {e}")

            # write plaintext to a local file (simulate client local file)
            local_path = os.path.join(workdir, f"{owner}_dataset.csv")
            with open(local_path, "wb") as f:
                f.write(plaintext)
            plaintext_paths.append(local_path)
            log.info(f"Wrote plaintext dataset for {owner} to {local_path}")

        # 4) prepare (inject) notebook: insert parameters cell with plaintext local paths and result_base
        prepared_nb_path = os.path.join(workdir, "prepared_workload.ipynb")
        inject_params_and_result_uploader(
            input_nb=workload_local,
            output_nb=prepared_nb_path,
            dataset_local_paths=plaintext_paths,
            result_base=req.result_base
        )
        log.info("Prepared notebook with injected parameters + uploader")

        # 5) execute notebook with papermill (kernel_name=None runs in-process)
        executed_nb_local = os.path.join(workdir, "executed.ipynb")
        log.info("Executing notebook (this runs inside the TEE process)")
        pm.execute_notebook(input_path=prepared_nb_path, output_path=executed_nb_local, kernel_name="python3")
        log.info("Notebook executed")

        # 6) upload executed notebook
        executed_target = req.executed_notebook_base + ".ipynb"
        upload_blob_from_file(executed_target, executed_nb_local)
        log.info(f"Uploaded executed notebook to {executed_target}")

        # 7) the injected uploader in the notebook should have uploaded a result.* to GCS under result_base.
        #    Find the actual result blob by listing the prefix and choosing the first match that starts with result_base name
        candidates = list_result_blob_under_prefix(req.result_base)
        if not candidates:
            raise HTTPException(status_code=500, detail="No result file found in results prefix after execution")
        # pick the candidate whose name starts with the base filename
        base_bucket, base_obj = parse_gs_uri(req.result_base)
        base_name = os.path.basename(base_obj)
        chosen = None
        for b in candidates:
            if os.path.basename(b.name).startswith(base_name):
                chosen = b
                break
        if not chosen:
            raise HTTPException(status_code=500, detail="No matching result file found")

        result_gcs_path = f"gs://{chosen.bucket.name}/{chosen.name}"
        ext = os.path.splitext(chosen.name)[1].lstrip(".")
        log.info(f"Result found: {result_gcs_path} (format={ext})")

        # return result metadata to orchestrator
        return {
            "status": "success",
            "workflow_id": workflow_id,
            "executed_notebook_path": executed_target,
            "result_path": result_gcs_path,
            "format": ext
        }

    except HTTPException:
        raise
    except Exception as e:
        log.exception("Execution failed")
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        # best-effort cleanup local files (plaintext should be purged)
        try:
            for root, dirs, files in os.walk(workdir):
                for name in files:
                    try:
                        os.remove(os.path.join(root, name))
                    except Exception:
                        pass
            os.rmdir(workdir)
        except Exception:
            pass


# ---------- Notebook injection helpers ----------
def inject_params_and_result_uploader(input_nb: str, output_nb: str, dataset_local_paths: List[str], result_base: str):
    """
    Reads input notebook, injects a parameters cell (tagged 'parameters') at top that sets
    variables client_paths = [path1, path2, ...] and result_base variable.
    Appends a result uploader cell that will look for 'result.*' files and upload to GCS.
    """
    nb = nbformat.read(input_nb, as_version=4)

    # Build parameters source
    # Expose dataset_local_paths as a Python list variable named `client_local_paths`
    dataset_list_py = "[" + ", ".join([f'r"{p}"' for p in dataset_local_paths]) + "]"
    params_source = f'''# Parameters
client_local_paths = {dataset_list_py}
result_base = r"{result_base}"
clientA_path = client_local_paths[0]  # path to ClientA's plaintext dataset
clientB_path = client_local_paths[1]  # path to ClientB's
ClientC_path = client_local_paths[2]  # path to ClientC's
'''
    params_cell = nbformat.v4.new_code_cell(source=params_source)
    params_cell.metadata["tags"] = ["parameters"]
    nb.cells.insert(0, params_cell)

    # Append dynamic result uploader cell
    uploader_source = r'''
# Dynamic result uploader injected by executor (DO NOT MODIFY)
import os
from google.cloud import storage
import json

# Find a file named result.* written by the notebook
result_file = None
for fname in os.listdir("."):
    if fname.startswith("result.") and os.path.isfile(fname):
        result_file = fname
        break

if result_file is None:
    raise RuntimeError("No result.* file found in working directory")

# Determine extension
_, ext = os.path.splitext(result_file)
gcs_target = result_base + ext

# Upload file to GCS
storage_client = storage.Client()
bucket_name, blob_path = result_base[5:].split("/", 1)
bucket = storage_client.bucket(bucket_name)
blob = bucket.blob(blob_path + ext)
blob.upload_from_filename(result_file)
print(f"Uploaded {result_file} to {gcs_target}")
'''
    uploader_cell = nbformat.v4.new_code_cell(source=uploader_source)
    nb.cells.append(uploader_cell)

    with open(output_nb, "w", encoding="utf-8") as f:
        nbformat.write(nb, f)


# ---------- Run server ----------
if __name__ == "__main__":
    import uvicorn
    uvicorn.run("executor:app", host="0.0.0.0", port=8443, log_level="info")
