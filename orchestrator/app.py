from fastapi import FastAPI, HTTPException, Query, File, UploadFile, Form, Depends, Path
from google.cloud import bigquery, storage
import uuid, datetime
import google.auth
from google.auth.transport.requests import Request
# import papermill as pm
import tempfile
import nbformat
import requests
from google.oauth2 import service_account
import os
from typing import List

app = FastAPI(title="Cleanroom Orchestrator")

bq_client = bigquery.Client()
storage_client = storage.Client()
TABLE_ID = None
APPROVAL_TABLE_ID = None
PROJECT_ID = "clean-room-exp"
DATASET = "cleanroom"
BUCKET = f"{PROJECT_ID}-cleanroom-demo"

EXECUTOR_URL = "http://35.226.47.93:8443"

# 👇 Add the dedicated signer service account email

#---------------------------CHANGES FOR LOCAL TESTING---------------------------
# SIGNER_EMAIL = "cleanroom-signer@clean-room-exp.iam.gserviceaccount.com" <- for cloud run

SA_KEY_PATH = os.path.join(os.path.dirname(__file__), "signer-sa-key.json")  # <- for local testing
creds = service_account.Credentials.from_service_account_file(SA_KEY_PATH)                # <- for local testing  
#--------------------------------------------------------------------------------

@app.post("/workflows")
def create_workflow(workflow_id: str = Query(...), 
                    creator: str = Query(...), 
                    collaborator: List[str] = Query(...),
                    workload_path: str = Query(...),
                    dataset_path: str = Query(...)):
    # workflow_id = str(uuid.uuid4())
    rows = [
        {
            "workflow_id": workflow_id,
            "creator": creator,
            "collaborator": collaborator,
            "workload_path": workload_path,
            "dataset_path": dataset_path,
            "status": "PENDING_APPROVAL",
            "created_at": f"{datetime.datetime.now()}"
        }
    ]
    TABLE_ID = f"{PROJECT_ID}.cleanroom.{creator}_workflows"
    errors = bq_client.insert_rows_json(TABLE_ID, rows)
    if errors:
        raise HTTPException(status_code=500, detail=f"Insert failed: {errors}")
    return {"workflow_id": workflow_id, "status": "PENDING_APPROVAL"}


@app.get("/workflows/{workflow_id}")
def get_workflow(workflow_id: str, creator: str = Query(...)):
    query = f"""
    SELECT * FROM `{PROJECT_ID}.cleanroom.{creator}_workflows`
    WHERE workflow_id = @workflow_id
    """
    job = bq_client.query(query, job_config=bigquery.QueryJobConfig(
        query_parameters=[bigquery.ScalarQueryParameter("workflow_id", "STRING", workflow_id)]
    ))
    rows = list(job.result())
    if not rows:
        raise HTTPException(status_code=404, detail="Workflow not found")
    return dict(rows[0])


@app.post("/workflows/{workflow_id}/approve")
def approve_workflow(workflow_id: str, client_id: str = Query(...)):
    APPROVAL_TABLE_ID = f"{PROJECT_ID}.{DATASET}.{client_id}_workflow_approvals"
    query = f"""
    INSERT INTO `{APPROVAL_TABLE_ID}`
    (workflow_id, approver, approved, approved_at)
    VALUES (@workflow_id, @approver, @approved, CURRENT_TIMESTAMP())
    """
    job = bq_client.query(query, job_config=bigquery.QueryJobConfig(
        query_parameters=[bigquery.ScalarQueryParameter("workflow_id", "STRING", workflow_id),
                          bigquery.ScalarQueryParameter("approver", "STRING", client_id),
                          bigquery.ScalarQueryParameter("approved", "BOOL", True)]        
    ))
    job.result()
    return {"workflow_id": workflow_id, "status": f"APPROVED_BY {client_id}"}


@app.post("/workflows/{workflow_id}/reject")
def reject_workflow(workflow_id: str, client_id: str = Query(...)):
    APPROVAL_TABLE_ID = f"{PROJECT_ID}.{DATASET}.{client_id}_workflow_approvals"
    query = f"""
    INSERT INTO `{APPROVAL_TABLE_ID}`
    (workflow_id, approver, approved, approved_at)
    VALUES (@workflow_id, @client_id, @False, CURRENT_TIMESTAMP())
    """
    job = bq_client.query(query, job_config=bigquery.QueryJobConfig(
        query_parameters=[bigquery.ScalarQueryParameter("workflow_id", "STRING", workflow_id)]
    ))
    job.result()
    return {"workflow_id": workflow_id, "status": "REJECTED"}


# -------------------------
# Generate Signed URL
# -------------------------
@app.post("/upload-url")
def generate_upload_url(
    workflow_id: str = Query(...),
    file_type: str = Query(..., regex="^(dataset|workload|key)$"),
    owner: str = Query(...)
):
    object_name = f"{file_type}s/{owner}/{workflow_id}"
    bucket = storage_client.bucket(BUCKET)
    blob = bucket.blob(object_name)

#---------------------------CHANGES FOR LOCAL TESTING---------------------------
    # ✅ IAM API signing (no JSON key needed)                                   
    # credentials, _ = google.auth.default()                                     
    # try:
    #     credentials.refresh(Request())   # ensures credentials.token exists
    #     access_token = credentials.token
    # except Exception:
    #     access_token = None
#--------------------------------------------------------------------------------

    url = blob.generate_signed_url(
        version="v4",
        expiration=datetime.timedelta(minutes=15),
        method="PUT",
#---------------------------CHANGES FOR LOCAL TESTING---------------------------
        # service_account_email=SIGNER_EMAIL, <- for cloud run
        # access_token=access_token,   # <-- important <- for cloud run

        content_type="application/octet-stream", # <- for local testing
        credentials=creds,               # <- for local testing
#--------------------------------------------------------------------------------
    )

    # Insert metadata in BigQuery
    table = f"{PROJECT_ID}.{DATASET}.{owner}_{file_type}s"
    row = {
        "workflow_id": workflow_id,
        "owner": owner,
        "gcs_path": f"gs://{BUCKET}/{object_name}",
        "created_at": datetime.datetime.now().isoformat()
    }
    errors = bq_client.insert_rows_json(table, [row])
    if errors:
        return {"error": errors}

    return {"upload_url": url, "gcs_path": row["gcs_path"], "id": row["workflow_id"]}


@app.get("/download-url")
def generate_download_url(
    gcs_path: str = Query(..., description="Full GCS path, e.g. gs://bucket-name/object-name")
):
    if not gcs_path.startswith("gs://"):
        raise HTTPException(status_code=400, detail="Invalid GCS path format")

    parts = gcs_path[5:].split("/", 1)
    if len(parts) != 2:
        raise HTTPException(status_code=400, detail="Invalid GCS path format")

    bucket_name, object_name = parts
    bucket = storage_client.bucket(bucket_name)
    blob = bucket.blob(object_name)

#---------------------------CHANGES FOR LOCAL TESTING---------------------------
    # credentials, _ = google.auth.default()
    # try:
    #     credentials.refresh(Request())
    #     access_token = credentials.token
    # except Exception:
    #     access_token = None
#--------------------------------------------------------------------------------

    url = blob.generate_signed_url(
        version="v4",
        expiration=datetime.timedelta(minutes=15),
        method="GET",
#---------------------------CHANGES FOR LOCAL TESTING---------------------------
        # service_account_email=SIGNER_EMAIL, <- for cloud run
        # access_token=access_token,   # <-- important <- for cloud run

        # content_type="application/octet-stream", # <- for local testing
        credentials=creds,               # <- for local testing
#--------------------------------------------------------------------------------
    )

    return {"download_url": url}

# ---------------------------
#  Runner Endpoint
# ---------------------------

def get_latest_dataset(workflow_id: str, owner: str) -> str:
    owner = owner
    query = f"""
        SELECT gcs_path
        FROM `{PROJECT_ID}.{DATASET}.{owner}_datasets`
        WHERE workflow_id = @workflow_id AND owner = @owner
        ORDER BY created_at DESC
        LIMIT 1
    """
    job = bq_client.query(
        query,
        job_config=bigquery.QueryJobConfig(
            query_parameters=[bigquery.ScalarQueryParameter("workflow_id", "STRING", workflow_id),
                              bigquery.ScalarQueryParameter("owner", "STRING", owner)]
        ),
    )
    rows = list(job.result())
    if not rows:
        raise HTTPException(status_code=404, detail=f"No dataset found for {owner}")
    return rows[0]["gcs_path"]

def get_latest_key(workflow_id: str, owner: str) -> str:
    owner = owner
    query = f"""
        SELECT gcs_path
        FROM `{PROJECT_ID}.{DATASET}.{owner}_keys`
        WHERE workflow_id = @workflow_id AND owner = @owner
        ORDER BY created_at DESC
        LIMIT 1
    """
    job = bq_client.query(
        query,
        job_config=bigquery.QueryJobConfig(
            query_parameters=[bigquery.ScalarQueryParameter("workflow_id", "STRING", workflow_id),
                              bigquery.ScalarQueryParameter("owner", "STRING", owner)]
        ),
    )
    rows = list(job.result())
    if not rows:
        raise HTTPException(status_code=404, detail=f"No dataset found for {owner}")
    return rows[0]["gcs_path"]

def prepare_notebook(input_path, output_path, clientA_path, clientB_path, result_base):
    nb = nbformat.read(open(input_path), as_version=4)

    # 1. Inject parameters cell at top
    params_cell = nbformat.v4.new_code_cell(
        source=f"""# Parameters
clientA_path = "{clientA_path}"
clientB_path = "{clientB_path}"
result_base = "{result_base}"
"""
    )
    params_cell.metadata["tags"] = ["parameters"]
    nb.cells.insert(0, params_cell)

    # 2. Inject result-upload cell at end
    result_cell = nbformat.v4.new_code_cell(
        source="""# Upload results to GCS
import os
from google.cloud import storage

# Look for any result.* file created by the notebook
result_file = None
for fname in os.listdir("."):
    if fname.startswith("result.") and os.path.isfile(fname):
        result_file = fname
        break

if result_file is None:
    raise RuntimeError("❌ No result file found (expected result.csv, result.json, result.txt, etc.)")

# Build GCS target path using result_path but swap extension dynamically
_, ext = os.path.splitext(result_file)
# gcs_target = result_path.rsplit(".", 1)[0] + ext
gcs_target = result_base + ext

storage_client = storage.Client()
bucket_name, blob_path = result_base[5:].split("/", 1)
bucket = storage_client.bucket(bucket_name)
blob = bucket.blob(blob_path + ext)

blob.upload_from_filename(result_file)
print(f"✅ Uploaded {result_file} to {gcs_target}")
"""
    )
    nb.cells.append(result_cell)

    # Save prepared notebook
    with open(output_path, "w") as f:
        nbformat.write(nb, f)

@app.post("/workflows/{workflow_id}/run")
def run_notebook(workflow_id: str, creator: str=Query(...), collaborators: List[str]=Query(...)):
    print(collaborators)
    for collaborator in collaborators:
        if not collaborator.startswith("Client"):
            raise HTTPException(status_code=400, detail=f"Invalid collaborator ID: {collaborator}")
        
        query = f"""
            SELECT *
            FROM `{PROJECT_ID}.{DATASET}.{collaborator}_workflow_approvals`
            WHERE workflow_id = @workflow_id
            ORDER BY approved_at DESC
            LIMIT 1
        """
        job = bq_client.query(
            query,
            job_config=bigquery.QueryJobConfig(
                query_parameters=[bigquery.ScalarQueryParameter("workflow_id", "STRING", workflow_id)]
            )
        )
        rows = list(job.result())
        if not rows or not rows[0]["approved"] == True:
            raise HTTPException(status_code=403, detail="Workflow not approved yet")

    # 1. Get workflow details from BigQuery
    query = f"""
        SELECT * EXCEPT(created_at) FROM `{PROJECT_ID}.{DATASET}.{creator}_workflows`
        WHERE workflow_id = @workflow_id
    """
    job = bq_client.query(
        query,
        job_config=bigquery.QueryJobConfig(
            query_parameters=[bigquery.ScalarQueryParameter("workflow_id", "STRING", workflow_id)]
        ),
    )

    rows = list(job.result())
    if not rows:
        raise HTTPException(status_code=404, detail="Workflow not found")
    workflow = rows[0]

    # creator = workflow["creator"]
    # collaborators = workflow["collaborator"]
    workload_path = workflow["workload_path"]

    creator_dataset = get_latest_dataset(workflow_id, creator)
    creator_key = get_latest_key(workflow_id, creator)
    collaborator_dataset = []
    collaborator_key = []
    for collaborator in collaborators:
        if not collaborator.startswith("Client"):
            raise HTTPException(status_code=400, detail=f"Invalid collaborator ID: {collaborator}")
        # if collaborator == creator:
        #     continue        
        collaborator_dataset.append(get_latest_dataset(workflow_id, collaborator))
        collaborator_key.append(get_latest_key(workflow_id, collaborator))

    # 2. Download notebook from GCS
    # bucket_name, workload_obj = workload_path[5:].split("/", 1)
    # workload_blob = storage_client.bucket(bucket_name).blob(workload_obj)

    # with tempfile.NamedTemporaryFile(suffix=".ipynb", delete=False) as temp_in:
    #     workload_blob.download_to_filename(temp_in.name)
    #     input_nb = temp_in.name

    # output_nb = tempfile.NamedTemporaryFile(suffix=".ipynb", delete=False).name

    # result_base = f"gs://{BUCKET}/results/{workflow_id}/result"
    # executed_notebook_path = f"gs://{BUCKET}/results/{workflow_id}/executed.ipynb"

    # # 3. Execute notebook with parameters

    # prepared_nb = tempfile.NamedTemporaryFile(suffix=".ipynb", delete=False).name
    # prepare_notebook(
    #     input_path=input_nb,
    #     output_path=prepared_nb,
    #     clientA_path=creator_dataset,
    #     clientB_path=collaborator_dataset,
    #     result_base=result_base
    # )

    # output_nb = tempfile.NamedTemporaryFile(suffix=".ipynb", delete=False).name

    # pm.execute_notebook(
    #     input_path=prepared_nb,
    #     output_path=output_nb,
    #     parameters={
    #         "clientA_path": creator_dataset,
    #         "clientB_path": collaborator_dataset,
    #         "result_base": f"gs://{BUCKET}/results/{workflow_id}/result"
    #     },
    #     kernel_name="python3"
    # )

    # # 4. Upload executed notebook (with outputs) back to GCS
    # executed_blob = storage_client.bucket(BUCKET).blob(f"results/{workflow_id}/executed.ipynb")
    # executed_blob.upload_from_filename(output_nb)

    # bucket_name, blob_prefix = result_base[5:].split("/", 1)
    # bucket = storage_client.bucket(bucket_name)

    # # Look for files with this prefix
    # blobs = list(bucket.list_blobs(prefix=blob_prefix))
    # result_blob = next((b for b in blobs if b.name.startswith(blob_prefix)), None)

    # if not result_blob:
    #     raise HTTPException(status_code=500, detail="Result file not found in GCS")

    # result_gcs_path = f"gs://{bucket_name}/{result_blob.name}"

    if not all([creator_dataset, creator_key, collaborator_dataset, collaborator_key]):
        raise HTTPException(status_code=400, detail="Missing dataset or key for one of the clients")
    
    result_base = f"gs://{BUCKET}/results/{workflow_id}/result"
    executed_base = f"gs://{BUCKET}/results/{workflow_id}/executed"

    datasets = []
    datasets.append({"owner": creator, "ciphertext_gcs": creator_dataset, "wrapped_dek_gcs": creator_key})
    for collaborator, dataset, key in zip(collaborators, collaborator_dataset, collaborator_key):
        if collaborator == creator:
            continue
        datasets.append({"owner": collaborator, "ciphertext_gcs": dataset, "wrapped_dek_gcs": key})

    print("Datasets to be sent to executor:", datasets)

    exec_payload = {
        "workflow_id": workflow_id,
        "workload_gcs": workflow.workload_path,
        "datasets": datasets,
        "result_base": result_base,
        "executed_notebook_base": executed_base
    }

    try:
        resp = requests.post(f"{EXECUTOR_URL}/execute", json=exec_payload, timeout=600)
        resp.raise_for_status()
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Executor failed: {e}")

    result_info = resp.json()

    # 5. Record result in BigQuery
    table = f"clean-room-exp.cleanroom.results"

    row = {
        "id": str(uuid.uuid4()),
        "workflow_id": workflow_id,
        "executed_notebook_path": result_info["executed_notebook_path"],
        "result_path": result_info["result_path"],
        "created_at": f"{datetime.datetime.now()}"
    }
    errors = bq_client.insert_rows_json(table, [row])
    if errors:
        raise HTTPException(status_code=500, detail=f"Failed to insert result metadata: {errors}")

    return {
        "status": "success",
        "executed_notebook": result_info["executed_notebook_path"],
        "result_json_path": result_info["result_path"]
    }

@app.get("/workflows/{workflow_id}/result")
def get_result(workflow_id: str):
    query = f"""
        SELECT * FROM `{PROJECT_ID}.cleanroom.results`
        WHERE workflow_id = @workflow_id
        ORDER BY created_at DESC
        LIMIT 1
    """
    job = bq_client.query(
        query,
        job_config=bigquery.QueryJobConfig(
            query_parameters=[bigquery.ScalarQueryParameter("workflow_id", "STRING", workflow_id)]
        )
    )
    rows = list(job.result())
    if not rows:
        raise HTTPException(status_code=404, detail="No results found for this workflow")
    return rows[0]

@app.get("/executor-pubkey")
def get_executor_pubkey():
    """
    Proxy endpoint: fetches enclave's public key + attestation evidence
    from the executor (running inside TEE) and returns it to clients.
    """
    try:
        resp = requests.get(f"{EXECUTOR_URL}/attestation", timeout=10)
        resp.raise_for_status()
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Failed to fetch from executor: {e}")

    return resp.json()

# @app.post("/executor-result")
# async def executor_result(
#     executed_nb: UploadFile = File(...),
#     result: UploadFile = File(...),
#     workflow_id: str = Form(...)
# ):
#     bucket = storage_client.bucket(BUCKET)
#     try:
#         # Define paths in GCS
#         executed_path = f"results/{workflow_id}/executed.ipynb"
#         result_path = f"results/{workflow_id}/{result.filename}"

#         # Upload executed notebook
#         executed_blob = bucket.blob(executed_path)
#         executed_blob.upload_from_file(executed_nb.file, content_type="application/x-ipynb+json")

#         # Upload result (dynamic type: json/csv/txt/etc.)
#         result_blob = bucket.blob(result_path)
#         result_blob.upload_from_file(result.file, content_type="application/octet-stream")

#         return {
#             "status": "success",
#             "workflow_id": workflow_id,
#             "executed_notebook_path": f"gs://{BUCKET}/{executed_path}",
#             "result_path": f"gs://{BUCKET}/{result_path}",
#         }

#     except Exception as e:
#         # log.exception("Executor result upload failed")
#         raise HTTPException(status_code=500, detail=str(e))