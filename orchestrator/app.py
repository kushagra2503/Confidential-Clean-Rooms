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
PROJECT_ID = "yellowsense-technologies"
DATASET = "cleanroom"
BUCKET = f"{PROJECT_ID}-cleanroom"

EXECUTOR_URL = "http://localhost:8443"

# 👇 Add the dedicated signer service account email

#---------------------------CHANGES FOR LOCAL TESTING---------------------------
# SIGNER_EMAIL = "cleanroom-signer@clean-room-exp.iam.gserviceaccount.com" <- for cloud run

SA_KEY_PATH = os.path.join(os.path.dirname(__file__), "yellowsense-technologies-17f4c4e3ed2c.json")  # <- for local testing
creds = service_account.Credentials.from_service_account_file(SA_KEY_PATH)                # <- for local testing  
#--------------------------------------------------------------------------------

FIXED_WORKLOAD_PATH = f"gs://yellowsense-technologies-cleanroom/workloads/model-1a.ipynb"

@app.post("/workflows")
def create_workflow(workflow_id: str = Query(...), 
                    creator: str = Query(...), 
                    collaborator: List[str] = Query(...)):
    rows = [
        {
            "workflow_id": workflow_id,
            "creator": creator,
            "collaborator": collaborator,
            "workload_path": FIXED_WORKLOAD_PATH,
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
    dataset_id: str = Query(...),
    filename: str = Query(...),
    file_type: str = Query(..., regex="^(dataset|workload|key)$"),
    owner: str = Query(...)
):
    object_name = f"{file_type}s/{owner}/{workflow_id}/{dataset_id}/{filename}"
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
        "created_at": datetime.datetime.now().isoformat(),
        "dataset_id": dataset_id
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

def get_all_datasets(workflow_id: str, owner: str) -> list:
    query = f"""
        SELECT dataset_id, gcs_path
        FROM `{PROJECT_ID}.{DATASET}.{owner}_datasets`
        WHERE workflow_id = @workflow_id AND owner = @owner
        ORDER BY created_at DESC
    """
    job = bq_client.query(
        query,
        job_config=bigquery.QueryJobConfig(
            query_parameters=[
                bigquery.ScalarQueryParameter("workflow_id", "STRING", workflow_id),
                bigquery.ScalarQueryParameter("owner", "STRING", owner),
            ]
        ),
    )
    return list(job.result())

def get_all_keys(workflow_id: str, owner: str) -> list:
    query = f"""
        SELECT dataset_id, gcs_path
        FROM `{PROJECT_ID}.{DATASET}.{owner}_keys`
        WHERE workflow_id = @workflow_id AND owner = @owner
        ORDER BY created_at DESC
    """
    job = bq_client.query(
        query,
        job_config=bigquery.QueryJobConfig(
            query_parameters=[
                bigquery.ScalarQueryParameter("workflow_id", "STRING", workflow_id),
                bigquery.ScalarQueryParameter("owner", "STRING", owner),
            ]
        ),
    )
    return list(job.result())

@app.post("/workflows/{workflow_id}/run")
def run_notebook(workflow_id: str, creator: str=Query(...), collaborators: List[str]=Query(...)):
    print(collaborators)
    for collaborator in collaborators:
        # if not collaborator.startswith("Client"):
        #     raise HTTPException(status_code=400, detail=f"Invalid collaborator ID: {collaborator}")
        
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

    creator_datasets = get_all_datasets(workflow_id, creator)
    creator_keys = get_all_keys(workflow_id, creator)

    datasets = []
    for ds in creator_datasets:
        for key in creator_keys:
            if ds["dataset_id"] == key["dataset_id"]:
                datasets.append({"owner": creator, "ciphertext_gcs": ds["gcs_path"], "wrapped_dek_gcs": key["gcs_path"]})
    # for ds, key in zip(creator_datasets, creator_keys):
    #     datasets.append({"owner": creator, "ciphertext_gcs": ds, "wrapped_dek_gcs": key})

    for collaborator in collaborators:
        collab_datasets = get_all_datasets(workflow_id, collaborator)
        collab_keys = get_all_keys(workflow_id, collaborator)
        for ds in collab_datasets:
            for key in collab_keys:
                if ds["dataset_id"] == key["dataset_id"]:
                    datasets.append({"owner": creator, "ciphertext_gcs": ds["gcs_path"], "wrapped_dek_gcs": key["gcs_path"]})
        # for ds, key in zip(collab_datasets, collab_keys):
        #     datasets.append({"owner": collaborator, "ciphertext_gcs": ds, "wrapped_dek_gcs": key})


    if not all([creator_datasets, creator_keys, collab_datasets, collab_keys]):
        raise HTTPException(status_code=400, detail="Missing dataset or key for one of the clients")
    
    result_base = f"gs://{BUCKET}/results/{workflow_id}/result"
    executed_base = f"gs://{BUCKET}/results/{workflow_id}/executed"

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
    # table = f"{PROJECT_ID}.cleanroom.results"

    # row = {
    #     "id": str(uuid.uuid4()),
    #     "workflow_id": workflow_id,
    #     "executed_notebook_path": result_info["executed_notebook_path"],
    #     "result_path": result_info["result_path"],
    #     "created_at": f"{datetime.datetime.now()}"
    # }
    # errors = bq_client.insert_rows_json(table, [row])
    # if errors:
    #     raise HTTPException(status_code=500, detail=f"Failed to insert result metadata: {errors}")

    table = f"{PROJECT_ID}.cleanroom.results"
    rows_to_insert = []

    # Get the list of paths from the executor's response
    result_paths = result_info.get("result_paths", [])
    executed_notebook_path = result_info.get("executed_notebook_path")
    created_time = f"{datetime.datetime.now()}"

    for path in result_paths:
        row = {
            "id": str(uuid.uuid4()),
            "workflow_id": workflow_id,
            "executed_notebook_path": executed_notebook_path,
            "result_path": path,
            "created_at": created_time
        }
        rows_to_insert.append(row)

    if rows_to_insert:
        errors = bq_client.insert_rows_json(table, rows_to_insert)
        if errors:
            raise HTTPException(status_code=500, detail=f"Failed to insert result metadata: {errors}")

    # return {
    #     "status": "success",
    #     "executed_notebook": result_info["executed_notebook_path"],
    #     "result_json_path": result_info["result_path"]
    # }
    # Check if a trained model zip exists
    model_gcs_path = None
    bucket_name, prefix = result_base[5:].split("/", 1)
    model_blob = storage_client.bucket(bucket_name).blob(prefix + "_model.zip")
    if model_blob.exists():
        model_gcs_path = f"gs://{bucket_name}/{prefix}_model.zip"

    # return {
    #     "status": "success",
    #     "executed_notebook": result_info["executed_notebook_path"],
    #     "result_json_path": result_info["result_paths"],
    #     "model_gcs_path": model_gcs_path   # <--- new field
    # }

    return {
        "status": "success",
        "executed_notebook": result_info.get("executed_notebook_path"),
        "result_json_paths": result_info.get("result_paths", []), # Use the new plural key
        "model_gcs_path": model_gcs_path
    }


# @app.get("/workflows/{workflow_id}/result")
# def get_result(workflow_id: str):
#     query = f"""
#         SELECT * FROM `{PROJECT_ID}.cleanroom.results`
#         WHERE workflow_id = @workflow_id
#         ORDER BY created_at DESC
#         LIMIT 1
#     """
#     job = bq_client.query(
#         query,
#         job_config=bigquery.QueryJobConfig(
#             query_parameters=[bigquery.ScalarQueryParameter("workflow_id", "STRING", workflow_id)]
#         )
#     )
#     rows = list(job.result())
#     if not rows:
#         raise HTTPException(status_code=404, detail="No results found for this workflow")
#     return rows

@app.get("/workflows/{workflow_id}/result")
def get_all_results(workflow_id: str):
    """
    Fetch all result files related to the given workflow_id.
    It queries BigQuery to find all result entries (paths), then generates signed URLs for each file.
    """

    # Query BigQuery for all result entries associated with this workflow
    query = f"""
        SELECT result_path, executed_notebook_path, created_at
        FROM `{PROJECT_ID}.cleanroom.results`
        WHERE workflow_id = @workflow_id
        ORDER BY created_at DESC
    """
    job = bq_client.query(
        query,
        job_config=bigquery.QueryJobConfig(
            query_parameters=[
                bigquery.ScalarQueryParameter("workflow_id", "STRING", workflow_id)
            ]
        ),
    )

    rows = list(job.result())
    if not rows:
        raise HTTPException(status_code=404, detail="No results found for this workflow")

    # For each result record, create signed URLs for download
    results_with_urls = []
    for row in rows:
        result_gcs_path = row["result_path"]
        if not result_gcs_path.startswith("gs://"):
            continue
        bucket_name, blob_path = result_gcs_path[5:].split("/", 1)
        blob = storage_client.bucket(bucket_name).blob(blob_path)

        signed_url = blob.generate_signed_url(
            version="v4",
            expiration=datetime.timedelta(minutes=30),
            method="GET",
            credentials=creds
        )

        results_with_urls.append({
            "result_path": result_gcs_path,
            "executed_notebook_path": row["executed_notebook_path"],
            "created_at": row["created_at"].isoformat(),
            "download_url": signed_url
        })

    return {"workflow_id": workflow_id, "results": results_with_urls}

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

@app.get("/logs/{workflow_id}")
def workflow_logs(workflow_id: str):
    # forward the request to executor
    executor_url = f"{EXECUTOR_URL}/logs/{workflow_id}"
    try:
        resp = requests.get(executor_url)
        # return resp.text, resp.status_code
        return resp.json()
    except Exception as e:
        return f"Error contacting executor: {e}", 500
