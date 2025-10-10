import os
import uuid
import json
import requests
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric import padding
from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.ciphers.aead import AESGCM

# CONFIG
ORCHESTRATOR_URL = os.environ.get("ORCHESTRATOR_URL", "http://localhost:8080")
CLIENT_ID = os.environ.get("CLIENT_ID", "ClientA")
DATA_FILE = os.environ.get("DATA_FILE", "train.csv")  # local dataset file
WORKFLOW_ID = None

def get_executor_pubkey():
    """Fetch executor pubkey from orchestrator (which proxies executor attestation)."""
    resp = requests.get(f"{ORCHESTRATOR_URL}/executor-pubkey")
    resp.raise_for_status()
    pubkey_pem = resp.json()["public_key_pem"]
    return serialization.load_pem_public_key(pubkey_pem.encode())

def encrypt_and_upload(workflow_id, pubkey, local_file, filename, owner):
    """Encrypt dataset, wrap DEK, upload both via orchestrator signed URLs."""
    if workflow_id is None:
        raise ValueError("workflow_id must be provided")
    
    # Generate dataset_id for uniqueness
    dataset_id = str(uuid.uuid4())

    # Generate DEK
    dek = AESGCM.generate_key(bit_length=256)

    # Encrypt dataset
    aesgcm = AESGCM(dek)
    nonce = os.urandom(12)
    if hasattr(local_file, "read"):
        plaintext = local_file.read()
    else:
        with open(local_file, "rb") as f:
            plaintext = f.read()
    ciphertext = nonce + aesgcm.encrypt(nonce, plaintext, None)

    # Wrap DEK with enclave pubkey
    wrapped_dek = pubkey.encrypt(
        dek,
        padding.OAEP(mgf=padding.MGF1(algorithm=hashes.SHA256()), algorithm=hashes.SHA256(), label=None)
    )

    # Ask orchestrator for signed upload URLs (ciphertext + key), including dataset_id
    resp_cipher = requests.post(
        f"{ORCHESTRATOR_URL}/upload-url",
        params={"workflow_id": workflow_id, "dataset_id": dataset_id, "filename": filename, "file_type": "dataset", "owner": owner}
    ).json()
    cipher_url, cipher_gcs = resp_cipher["upload_url"], resp_cipher["gcs_path"]

    resp_dek = requests.post(
        f"{ORCHESTRATOR_URL}/upload-url",
        params={"workflow_id": workflow_id, "dataset_id": dataset_id, "filename": filename, "file_type": "key", "owner": owner}
    ).json()
    dek_url, dek_gcs = resp_dek["upload_url"], resp_dek["gcs_path"]

    # Upload ciphertext
    put1 = requests.put(cipher_url, data=ciphertext, headers={"Content-Type": "application/octet-stream"})
    if put1.status_code != 200:
        raise RuntimeError(f"Ciphertext upload failed: {put1.text}")

    # Upload wrapped DEK
    put2 = requests.put(dek_url, data=wrapped_dek, headers={"Content-Type": "application/octet-stream"})
    if put2.status_code != 200:
        raise RuntimeError(f"Wrapped DEK upload failed: {put2.text}")

    print(f"✅ Uploaded dataset {dataset_id} for workflow {workflow_id}")

    return {
        "workflow_id": workflow_id,
        "filename": filename,
        "dataset_id": dataset_id,
        "owner": owner,
        "ciphertext_gcs": cipher_gcs,
        "wrapped_dek_gcs": dek_gcs,
        "upload_status_dataset": put1.status_code,
        "upload_status_dek": put2.status_code
    }

if __name__ == "__main__":
    pubkey = get_executor_pubkey()
    result = encrypt_and_upload(WORKFLOW_ID, pubkey, DATA_FILE, CLIENT_ID)
    print(json.dumps(result, indent=2))
