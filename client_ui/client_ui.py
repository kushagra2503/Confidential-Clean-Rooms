import streamlit as st
import requests
import client_crypto
import pandas as pd
import uuid
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.metrics.pairwise import cosine_similarity
import re
import json

API_URL = "http://localhost:8080"  # change if deployed
# API_URL = "https://orchestrator-699315901301.us-central1.run.app"

st.set_page_config(page_title="Cleanroom", layout="wide")

page_bg = """
<style>
[data-testid="stAppViewContainer"] {
    background-color: #EDC001;
}
[data-testid="stHeader"] {
    background: rgba(0,0,0,0);
}
</style>
"""
st.markdown(page_bg, unsafe_allow_html=True)

# st.title("YellowSense Fraud Detection Using CCR Demo")
st.markdown(
    """
    <h1 style='text-align: center; color: black;'>
        YellowSense Fraud Detection Using CCR Demo
    </h1>
    """,
    unsafe_allow_html=True
)

mode = st.sidebar.radio("Login as:", ["Creator (Client A)", "Collaborator (Client B)", "Fraud Analyst (Viewer)"])


if "dataset_path" not in st.session_state:
    st.session_state.dataset_path = None
if "workload_path" not in st.session_state:
    st.session_state.workload_path = None
if "workflow_id" not in st.session_state:
    st.session_state.workflow_id = None

# ------------------------------
# CREATOR VIEW
# ------------------------------
if mode == "Creator (Client A)":
    workflow_id = None
    if st.button("Create Workflow"):
        workflow_id = str(uuid.uuid4())
        st.session_state.workflow_id = workflow_id
        # workflow_id = st.session_state.workflow_id

    if st.session_state.workflow_id:
        # st.session_state.workflow_id = workflow_id
        creator = st.text_input("Your ID (Creator)", value="ClientA")
        client_id = creator.strip()
        st.header("📂 Upload Dataset")
        dataset_file = st.file_uploader("Upload a CSV dataset", type=["csv"])
        dataset_gcs_path = None
        if dataset_file and st.button("Upload Dataset"):
            # Ask orchestrator for signed URL
            # resp = requests.post(
            #     f"{API_URL}/upload-url",
            #     params={"file_type": "dataset", "owner": client_id}
            # ).json()
            # upload_url = resp["upload_url"]
            # dataset_gcs_path = resp["gcs_path"]
            # if dataset_gcs_path:
            #     st.session_state.dataset_path = dataset_gcs_path

            # # Upload file to signed URL
            # put_resp = requests.put(upload_url, data=dataset_file.getvalue(), headers={"Content-Type": "application/octet-stream"},)
            # if put_resp.status_code == 200:
            #     st.success(f"Dataset uploaded successfully ✅ ({st.session_state.dataset_path})")
            # else:
            #     st.error("Dataset upload failed")
            
            pubkey = client_crypto.get_executor_pubkey()
            result = client_crypto.encrypt_and_upload(st.session_state.workflow_id, pubkey, dataset_file, client_id)
            if result.get("upload_status_dataset") == 200 and result.get("upload_status_dek") == 200:
                st.session_state.dataset_path = result.get("ciphertext_gcs")
                st.success("Encrypted dataset uploaded ✅")
                st.json(result)
                st.subheader("🔒 Encrypted dataset preview")
                st.code(result['encrypted_dataset'] + "...", language="text")

        st.header("📝 Upload Workload (SQL or Notebook)")
        workload_file = st.file_uploader("Upload workload file", type=["sql", "ipynb"])
        workload_gcs_path = None
        if workload_file and st.button("Upload Workload"):
            resp = requests.post(
                f"{API_URL}/upload-url",
                params={"workflow_id": st.session_state.workflow_id, "file_type": "workload", "owner": client_id}
            ).json()
            upload_url = resp["upload_url"]
            workload_gcs_path = resp["gcs_path"]
            if workload_gcs_path:
                st.session_state.workload_path = workload_gcs_path

            put_resp = requests.put(upload_url, data=workload_file.getvalue(), headers={"Content-Type": "application/octet-stream"},)
            if put_resp.status_code == 200:
                st.success(f"Workload uploaded successfully ✅ ({st.session_state.workload_path})")
            else:
                st.error("Workload upload failed")

        st.subheader("Create a Workflow")
        # creator = st.text_input("Your ID (Creator)", value="ClientA")
        collaborator = st.text_input("Collaborator ID", value="ClientB")
        dataset_path = st.text_input("Dataset Path (CSV)", value=f"{st.session_state.dataset_path}")
        workload_path = st.text_input("Workload Path (SQL/Notebook)", value=f"{st.session_state.workload_path}")

        collaborators = [creator]
        for c in collaborator.split(","):
            collaborators.append(c.strip())

        if st.button("Submit Workflow"):
            payload = {
                "workflow_id": st.session_state.workflow_id,
                "creator": creator,
                "collaborator": collaborators,
                "workload_path": workload_path,
                "dataset_path": st.session_state.dataset_path
            }
            resp = requests.post(f"{API_URL}/workflows", params=payload)
            resp2 = requests.post(f"{API_URL}/workflows/{st.session_state.workflow_id}/approve", params={"client_id": client_id})
            if resp.status_code == 200 and resp2.status_code == 200:            
                st.success(f"Workflow created: {resp.json()}")
            else:
                st.error(f"Error: {resp.text}")

    # st.subheader("My Workflows")
    # if st.button("Refresh Workflows"):
    #     resp = requests.get(f"{API_URL}/workflows/{creator}")
    #     if resp.status_code == 200:
    #         st.json(resp.json())
    #     else:
    #         st.warning("No workflows found or API error.")

    workflow_id = st.text_input("Workflow ID")

    if workflow_id:
        if st.button("Run Workflow"):
            resp = requests.post(f"{API_URL}/workflows/{workflow_id}/run", params={"creator": client_id, "collaborators": collaborators})
            if resp.status_code == 200:
                result_info = resp.json()
                st.session_state.last_run_workflow_id = workflow_id
                st.success("Workflow executed successfully ✅")
                st.write("Executed Notebook:", result_info["executed_notebook"])
                st.write("Result JSON:", result_info["result_json_path"])
            elif resp.status_code == 403:
                st.warning("This workflow has not been approved yet.")
            else:
                st.error(f"Execution failed: {resp.text}")

        if st.session_state.get("last_run_workflow_id") == workflow_id:
            # Fetch latest result metadata
            resp = requests.get(f"{API_URL}/workflows/{workflow_id}/result")
            if resp.status_code == 200:
                result = resp.json()
                st.subheader("Compliance Monitor")
                # st.json(result)
                st.info(f"📂 Result available in format: {result.get('format', 'unknown')}")
                gcs_path = result["result_path"]

                # Get signed download URL
                dl_resp = requests.get(f"{API_URL}/download-url", params={"gcs_path": gcs_path})
                if dl_resp.status_code == 200:
                    download_url = dl_resp.json()["download_url"]
                    # alerts = result.get(download_url)
                    # st.table(alerts.text)
                    # Download button
                    st.markdown(
                        f"<a href='{download_url}' target='_blank'>"
                        f"<button style='background-color: #4CAF50; color: white; "
                        f"padding: 10px 20px; border: none; border-radius: 5px;'>"
                        f"📥 Download Result File"
                        f"</button></a>",
                        unsafe_allow_html=True
                    )
                else:
                    st.warning("Could not generate download link for result.")
            else:
                st.warning("No result found for this workflow yet.")

# ------------------------------
# COLLABORATOR VIEW (UPDATED)
# ------------------------------
if "approved_workflow_id" not in st.session_state:
    st.session_state.approved_workflow_id = None
if "b_dataset_path" not in st.session_state:
    st.session_state.b_dataset_path = None

if mode == "Collaborator (Client B)":
    # client_id = "ClientB"
    st.subheader("Pending Workflows")
    collaborator = st.text_input("Your ID (Collaborator)", value="ClientB")
    workflow_id = st.text_input("Workflow ID to review")
    client_id = collaborator.strip()

    if workflow_id:
        resp = requests.get(f"{API_URL}/workflows/{workflow_id}", params={"creator": "ClientA"})
        if resp.status_code == 200:
            workflow = resp.json()
            st.json(workflow)

            # Workload preview
            workload_path = workflow.get("workload_path")
            if workload_path:
                st.caption("Workload Preview:")
                file_resp = requests.get(
                    f"{API_URL}/download-url",
                    params={"gcs_path": workload_path}
                )
                if file_resp.status_code == 200:
                    # st.info(f"Workload path: {file_resp.json()["download_url"]}")
                    download_url = file_resp.json()["download_url"]
                    content_resp = requests.get(download_url)
                    if content_resp.status_code == 200:
                        st.code(content_resp.text, language="sql")
                    else:
                        st.warning("Could not fetch workload content")
                else:
                    st.warning("Could not generate download URL for workload")

            col1, col2 = st.columns(2)

            with col1:
                if st.button("Approve Workflow"):
                    if workflow_id:
                        st.session_state.approved_workflow_id = workflow_id
                        st.info("✅ Workflow approved. Please upload your dataset below.")
                    else:
                        st.warning("Enter workflow ID first")

            with col2:
                if st.button("Reject Workflow"):
                    if workflow_id:
                        resp = requests.post(f"{API_URL}/workflows/{workflow_id}/reject", params={"client_id": client_id})
                        if resp.status_code == 200:
                            st.success(f"Rejected: {resp.json()}")
                        else:
                            st.error(f"Error: {resp.text}")
                    else:
                        st.warning("Enter workflow ID first")

            # 🔹 Dataset upload block (persists after approval)
            if st.session_state.approved_workflow_id == workflow_id:
                st.subheader("📂 Upload Your Dataset")
                collaborator_dataset = st.file_uploader(
                    "Upload your CSV dataset", type=["csv"], key="collaborator_dataset"
                )

                if collaborator_dataset and st.button("Upload Dataset"):
                    # Ask orchestrator for signed URL
                    # resp = requests.post(
                    #     f"{API_URL}/upload-url",
                    #     params={"file_type": "dataset", "owner": client_id}
                    # ).json()
                    # upload_url = resp["upload_url"]
                    # collaborator_dataset_path = resp["gcs_path"]

                    # if collaborator_dataset_path:
                    #     st.session_state.b_dataset_path = collaborator_dataset_path
                    #     st.success(f"Got upload URL. Uploading to {st.session_state.b_dataset_path}")

                    # # Upload file to signed URL
                    # put_resp = requests.put(
                    #     upload_url,
                    #     data=collaborator_dataset.getvalue(),
                    #     headers={"Content-Type": "application/octet-stream"},
                    # )
                    pubkey = client_crypto.get_executor_pubkey()
                    result = client_crypto.encrypt_and_upload(workflow_id, pubkey, collaborator_dataset, client_id)
                    if result.get("upload_status_dataset") == 200 and result.get("upload_status_dek") == 200:
                        st.success("Encrypted dataset uploaded ✅")
                        st.json(result)
                    # if put_resp.status_code == 200:
                    #     st.success("Your dataset uploaded successfully ✅")

                        # Approve workflow with dataset path
                        approval_payload = {
                            "collaborator_dataset_path": st.session_state.b_dataset_path
                        }
                        resp = requests.post(
                            f"{API_URL}/workflows/{workflow_id}/approve",
                            params={"client_id": client_id},
                            json=approval_payload
                        )
                        if resp.status_code == 200:
                            st.success(f"Workflow approved with your data: {resp.json()}")
                        else:
                            st.error(f"Dataset uploaded but approval failed: {resp.text}")
                    else:
                        st.error("Dataset upload failed")
        else:
            st.warning("Workflow not found or API error.")
    else:
        st.info("Enter a workflow ID to review")

if mode == "Fraud Analyst (Viewer)":
    # ------------------------------
    # Core Fraud Detection Functions
    # ------------------------------
    def preprocess(text: str) -> str:
        text = re.sub(r"[^a-zA-Z0-9 ]", " ", text.lower())
        return text.strip()


    def check_announcement(new_text: str, historical_texts: list) -> dict:
        corpus = [preprocess(doc) for doc in historical_texts + [new_text]]
        vectorizer = TfidfVectorizer(stop_words="english")
        tfidf_matrix = vectorizer.fit_transform(corpus)

        sim_scores = cosine_similarity(tfidf_matrix[-1], tfidf_matrix[:-1])
        credibility_score = round(sim_scores.max() * 100, 2) if sim_scores.size > 0 else 0.0

        RED_FLAGS = [
            "guaranteed returns", "unprecedented growth",
            "risk-free", "assured profits", "multi-bagger",
            "100% safe", "no loss"
        ]
        flags = [kw for kw in RED_FLAGS if kw in new_text.lower()]

        return {
            "credibility_score": credibility_score,
            "flags": flags
        }


    def verify_advisor(name: str, db_path="../FraudDetector/sebi_db.json") -> dict:
        try:
            with open(db_path) as f:
                sebi_db = json.load(f)
        except FileNotFoundError:
            # fallback mock DB
            sebi_db = [
                {"name": "ABC Securities", "reg_id": "INZ00012345", "status": "Active"},
                {"name": "XYZ Advisors", "reg_id": "INZ00067890", "status": "Revoked"}
            ]

        for entry in sebi_db:
            if name.lower() in entry["name"].lower():
                return entry
        return {"name": name, "status": "Not Found"}


    def compute_risk(credibility: float, flags: list, advisor_status: str) -> dict:
        score = 100
        if credibility < 40:
            score -= 40
        if flags:
            score -= 30
        if advisor_status in ["Revoked", "Not Found"]:
            score -= 30

        verdict = "✅ Legit"
        color = "green"
        if score < 30:
            verdict = "❌ Likely Fraud"
            color = "red"
        elif score < 80:
            verdict = "⚠️ Needs Review"
            color = "orange"

        return {
            "fraud_score": max(score, 0),
            "verdict": verdict,
            "color": color
        }


    def detect_fraud(press_release: str, advisor_name: str, historical_texts: list) -> dict:
        ann_result = check_announcement(press_release, historical_texts)
        adv_result = verify_advisor(advisor_name)
        risk = compute_risk(ann_result["credibility_score"], ann_result["flags"], adv_result["status"])

        return {
            "announcement_check": ann_result,
            "advisor_check": adv_result,
            "risk_result": risk
        }


    # ------------------------------
    # Streamlit App UI
    # ------------------------------
    # st.set_page_config(page_title="Fraud Detection Demo", page_icon="🔍", layout="wide")

    # st.title("🔍 SEBI Fraud Detection Prototype")
    st.markdown(
    """
    <h2 style='text-align: center; color: black;'>
        🔍 SEBI Fraud Detection Prototype
    </h2>
    """,
    unsafe_allow_html=True
)
    st.markdown("Upload a corporate press release and enter advisor/intermediary details for fraud risk analysis.")

    # Sidebar
    st.header("Input Options")
    uploaded_file = st.file_uploader("Upload Press Release (TXT only for demo)", type=["txt"])
    advisor_name = st.text_input("Advisor / Intermediary Name", "")

    # Example historical data
    historical = [
        "Our revenue grew 5% last quarter with steady profits.",
        "The company achieved consistent growth in domestic sales.",
        "Earnings increased moderately in line with industry trends."
        "We are committed to transparency and regulatory compliance.",
        "Growth was stable with no unusual fluctuations."
    ]

    press_text = ""
    if uploaded_file is not None:
        press_text = uploaded_file.read().decode("utf-8")
    else:
        press_text = st.text_area("Or paste press release text here:", height=200)

    if st.button("Run Analysis"):
        if not press_text.strip():
            st.error("Please provide a press release (upload or paste text).")
        elif not advisor_name.strip():
            st.error("Please enter an advisor/intermediary name.")
        else:
            result = detect_fraud(press_text, advisor_name, historical)

            # Show results
            risk = result["risk_result"]
            st.subheader("📊 Fraud Detection Report")
            st.markdown(f"**Legitimacy Score:** {risk['fraud_score']}/100")
            st.markdown(f"**Verdict:** <span style='color:{risk['color']}; font-size:20px'>{risk['verdict']}</span>", unsafe_allow_html=True)

            st.write("### Announcement Check")
            st.json(result["announcement_check"])

            st.write("### Advisor Check")
            st.json(result["advisor_check"])