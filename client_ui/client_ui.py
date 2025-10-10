import streamlit as st
import requests
import client_crypto
import uuid
import time
import pandas as pd    
import json              
from io import StringIO 

API_URL = "http://localhost:8080"  # change if deployed

st.set_page_config(page_title="Cleanroom", layout="wide")

page_bg = """
<style>
[data-testid="stAppViewContainer"] {
    background-color: #fffbb3;
}
[data-testid="stHeader"] {
    background: rgba(0,0,0,0);
}
</style>
"""
st.markdown(page_bg, unsafe_allow_html=True)

st.title("YellowSense Welfare Fraud Detection Model In CCR Demo")

# Create tabs for Solo vs Collaboration
tab1, tab2 = st.tabs(["👤 Solo Mode", "🤝 Collaboration Mode"])

# ------------------------------
# SOLO MODE (NO COLLABORATORS)
# ------------------------------
with tab1:
    st.header("Run Workload")
    client_id = st.text_input("Your ID", value="Auditor")
    if st.button("Create Solo Workflow"):
        st.session_state.workflow_id = str(uuid.uuid4())
        st.success(f"Workflow created with ID: {st.session_state.workflow_id}")

    if st.session_state.get("workflow_id"):
        solo_datasets = st.file_uploader(
            "Upload one or more datasets (CSV)", type=["csv"], accept_multiple_files=True, key="solo_uploader"
        )

        uploaded_paths = []
        if solo_datasets and st.button("Upload Datasets"):
            pubkey = client_crypto.get_executor_pubkey()
            for i, ds in enumerate(solo_datasets):
                result = client_crypto.encrypt_and_upload(
                    st.session_state.workflow_id, pubkey, ds, ds.name, f"{client_id}"
                )
                if result.get("upload_status_dataset") == 200:
                    uploaded_paths.append(result.get("ciphertext_gcs"))
            if uploaded_paths:
                payload = {
                    "workflow_id": st.session_state.workflow_id,
                    "creator": client_id,
                    "collaborator": [client_id]
                }
                resp = requests.post(f"{API_URL}/workflows", params=payload)
                if resp.status_code == 200:
                    st.success(f"Workflow submitted: {resp.json()}")
                else:
                    st.error(f"Error: {resp.text}")
                resp = requests.post(
                        f"{API_URL}/workflows/{st.session_state.workflow_id}/approve",
                        params={"workflow_id": st.session_state.workflow_id, "client_id": client_id}
                    )
                st.success(f"Uploaded {len(uploaded_paths)} encrypted datasets ✅")
                st.session_state.dataset_paths = uploaded_paths

        if st.session_state.get("dataset_paths") and st.button("Run Solo Workflow"):
            payload = {
                "workflow_id": st.session_state.workflow_id,
                "creator": client_id,
                "collaborators": [client_id],  # only self
                # "dataset_paths": st.session_state.dataset_paths
            }
            resp = requests.post(f"{API_URL}/workflows/{st.session_state.workflow_id}/run", params=payload)
            st.write("### 📜 Execution Logs")
            log_box = st.empty()

            # Poll orchestrator logs
            # while True:
            resp = requests.get(f"{API_URL}/logs/{st.session_state.workflow_id}")
            if resp.status_code == 200:
                logs = resp.json().get("logs", [])
                log_text = "\n".join(logs)
                log_box.text_area("Live Logs", log_text, height=300, key="solo_log_area")
            else:
                log_box.text_area("Live Logs", "⚠️ Failed to fetch logs", height=300, key="solo_log_area_error")
                # break

                # Optional: stop polling if execution is complete
                # if any("Notebook executed" in l for l in logs):
                #     break

                time.sleep(2)  # poll every 2 seconds
                
            if resp.status_code == 200:
                result_info = resp.json()
                st.success("Workflow executed successfully ✅")
                st.write("Executed Notebook:", result_info["executed_notebook"])
                st.write("Result JSON:", result_info["result_json_paths"])
                model_gcs_path = result_info.get("model_gcs_path")
                if model_gcs_path:
                    # Get a signed download URL from the orchestrator
                    resp_dl = requests.get(f"{API_URL}/download-url", params={"gcs_path": model_gcs_path})
                    if resp_dl.status_code == 200:
                        download_url = resp_dl.json()["download_url"]
                        st.write("Trained Model:", download_url)
                        st.markdown(f'<a href="{download_url}" download>Click to Download Model</a>', unsafe_allow_html=True)
                    else:
                        st.error(f"Failed to get download URL: {resp_dl.text}")
                else:
                    print("No Models found")

                # Extract result info
                result_data = resp.json()
                workflow_id = result_data.get("workflow_id") or st.session_state.workflow_id

                st.subheader("📦 Workflow Results")

                with st.spinner("Fetching result files..."):
                    res = requests.get(f"{API_URL}/workflows/{workflow_id}/result")
                    if res.status_code != 200:
                        st.error(f"Failed to fetch results: {res.text}")
                    else:
                        rows = res.json()
                        results = rows if isinstance(rows, list) else [rows]

                        if not results:
                            st.warning("No result files found for this workflow.")
                        else:
                            st.markdown("### Individual Result Files")

                            # for r in results:
                            #     gcs_path = r["result_path"]

                            #     # Generate a signed download URL from orchestrator
                            #     try:
                            #         dl_resp = requests.get(
                            #             f"{API_URL}/download-url",
                            #             params={"gcs_path": gcs_path},
                            #             timeout=10,
                            #         )
                            #         if dl_resp.status_code == 200:
                            #             download_url = dl_resp.json()["download_url"]
                            #         else:
                            #             download_url = None
                            #     except Exception:
                            #         download_url = None

                            #     file_name = gcs_path.split("/")[-1]
                            #     created_at = r.get("created_at", "")

                            #     # Display result in a pretty card with download link
                            #     st.markdown(
                            #         f"""
                            #         <div style="
                            #             background-color: #f9f9f9;
                            #             border-radius: 12px;
                            #             padding: 16px;
                            #             margin-bottom: 12px;
                            #             box-shadow: 0 2px 6px rgba(0,0,0,0.1);
                            #             border: 1px solid #eee;
                            #         ">
                            #             <h5 style="margin: 0;">📄 {file_name}</h5>
                            #             <p style="margin: 5px 0; color: #666;">Created: {created_at}</p>
                            #             {"<a href='" + download_url + "' target='_blank' style='text-decoration: none; background-color: #2b9348; color: white; padding: 8px 15px; border-radius: 6px; font-weight: bold;'>⬇️ Download</a>" if download_url else "<p style='color:red'>Download link unavailable.</p>"}
                            #         </div>
                            #         """,
                            #         unsafe_allow_html=True,
                            #     )

                            for r in results:
                                gcs_path = r["result_path"]
                                file_name = gcs_path.split("/")[-1]
                                created_at = r.get("created_at", "")
                                download_url = r.get("download_url") # The URL is already in the response from /result

                                # Use an expander for each result file
                                with st.expander(f"📄 **{file_name}** (Created: {created_at})", expanded=True):
                                    if download_url:
                                        try:
                                            # Fetch the actual content from the signed URL
                                            content_resp = requests.get(download_url)
                                            content_resp.raise_for_status()  # Raise an error for bad responses (4xx or 5xx)

                                            # --- Display content based on file type ---

                                            # 1. Display CSV files as tables
                                            if file_name.endswith('.csv'):
                                                df = pd.read_csv(StringIO(content_resp.text))
                                                st.dataframe(df)

                                            # 2. Display JSON files as metrics or interactive JSON
                                            elif file_name.endswith('.json'):
                                                data = content_resp.json()
                                                # If it's a simple dictionary of metrics, display them nicely
                                                if isinstance(data, dict) and all(isinstance(v, (int, float)) for v in data.values()):
                                                    st.write("##### Key Metrics")
                                                    cols = st.columns(len(data))
                                                    for i, (key, value) in enumerate(data.items()):
                                                        # Format the label nicely (e.g., "accuracy_score" -> "Accuracy Score")
                                                        formatted_label = key.replace("_", " ").title()
                                                        cols[i].metric(label=formatted_label, value=f"{value:.4f}")
                                                # Otherwise, show the full JSON object
                                                else:
                                                    st.json(data)
                                            
                                            # 3. Display other text files as plain text
                                            else:
                                                st.text(content_resp.text)
                                            
                                            # Provide a download link as a fallback
                                            st.markdown(f'<a href="{download_url}" download="{file_name}" style="text-decoration: none; color: #1c83e1;">📥 Download Raw File</a>', unsafe_allow_html=True)

                                        except Exception as e:
                                            st.error(f"Could not load or display content for {file_name}: {e}")
                                    else:
                                        st.warning("Download link was not available for this file.")
            else:
                st.error(f"Execution failed: {resp.text}")

# ------------------------------
# COLLABORATION MODE (COMPLETE)
# ------------------------------
with tab2:
    st.header("Collaborative Workflow")
    role = st.radio("Login as:", ["Creator", "Collaborator"])

    # ------------------------------
    # CREATOR VIEW
    # ------------------------------
    if role == "Creator":
        creator_id = st.text_input("Your ID (Creator)", value="Auditor")

        # Option to create or use existing workflow
        st.subheader("Workflow Setup")
        col1, col2 = st.columns(2)
        with col1:
            if st.button("🆕 Create New Workflow"):
                st.session_state.workflow_id = str(uuid.uuid4())
                st.success(f"Workflow created with ID: {st.session_state.workflow_id}")
        with col2:
            existing_id = st.text_input("Or enter existing Workflow ID to continue")
            if existing_id:
                st.session_state.workflow_id = existing_id.strip()
                st.info(f"Using existing workflow: {st.session_state.workflow_id}")

        # --- Upload creator datasets ---
        if st.session_state.get("workflow_id"):
            collaborators = st.text_input("Add Collaborator IDs (comma-separated)", value="ClientB")
            collaborator_list = [creator_id] + [c.strip() for c in collaborators.split(",")]

            creator_datasets = st.file_uploader(
                "Upload one or more datasets (CSV)",
                type=["csv"],
                accept_multiple_files=True,
                key="creator_datasets_uploader"
            )

            uploaded_paths = []
            if creator_datasets and st.button("Upload Creator Datasets"):
                pubkey = client_crypto.get_executor_pubkey()
                for ds in creator_datasets:
                    result = client_crypto.encrypt_and_upload(
                        st.session_state.workflow_id, pubkey, ds, ds.name, f"{creator_id}"
                    )
                    if result.get("upload_status_dataset") == 200:
                        uploaded_paths.append(result.get("ciphertext_gcs"))
                if uploaded_paths:
                    st.success(f"Uploaded {len(uploaded_paths)} encrypted datasets ✅")
                    st.session_state.dataset_paths = uploaded_paths

            # --- Submit workflow for approval ---
            if st.session_state.get("dataset_paths") and st.button("Submit Workflow"):
                payload = {
                    "workflow_id": st.session_state.workflow_id,
                    "creator": creator_id,
                    "collaborator": collaborator_list
                }
                resp = requests.post(f"{API_URL}/workflows", params=payload)
                if resp.status_code == 200:
                    requests.post(
                        f"{API_URL}/workflows/{st.session_state.workflow_id}/approve",
                        params={"workflow_id": st.session_state.workflow_id, "client_id": creator_id}
                    )
                    st.success(f"Workflow submitted ✅ Waiting for collaborator approvals.")
                else:
                    st.error(f"Error submitting workflow: {resp.text}")

            st.markdown("---")

            # --- Run approved workflow ---
            st.subheader("▶️ Run Approved Workflow")
            workflow_to_run = st.text_input("Enter Workflow ID to Run", value=st.session_state.workflow_id)

            if st.button("Run Collaborative Workflow"):
                payload = {
                    "workflow_id": workflow_to_run,
                    "creator": creator_id,
                    "collaborators": collaborator_list
                }

                resp = requests.post(
                    f"{API_URL}/workflows/{workflow_to_run}/run", params=payload
                )

                if resp.status_code == 403:
                    st.warning("⚠️ Workflow not yet approved by all collaborators.")
                elif resp.status_code != 200:
                    st.error(f"Execution failed: {resp.text}")
                else:
                    st.success("Workflow execution started ✅")
                    st.write("### 📜 Execution Logs")
                    log_box = st.empty()

                    # Poll orchestrator logs
                    while True:
                        resp_logs = requests.get(f"{API_URL}/logs/{workflow_to_run}")
                        if resp_logs.status_code == 200:
                            logs = resp_logs.json().get("logs", [])
                            log_text = "\n".join(logs)
                            log_box.text_area("Live Logs", log_text, height=300)
                        else:
                            log_box.text_area("Live Logs", "⚠️ Failed to fetch logs", height=300)
                            break

                        if any("Notebook executed" in l for l in logs):
                            break

                        time.sleep(2)  # poll every 2s

                    # --- After execution ---
                    result_info = resp.json()
                    st.success("Workflow executed successfully ✅")
                    st.write("Executed Notebook:", result_info.get("executed_notebook"))
                    st.write("Result:", result_info.get("result_json_paths"))

                    # Extract result info
                    workflow_id = result_info.get("workflow_id") or st.session_state.workflow_id

                    st.subheader("📦 Workflow Results")

                    with st.spinner("Fetching result files..."):
                        res = requests.get(f"{API_URL}/workflows/{workflow_id}/result")
                        if res.status_code != 200:
                            st.error(f"Failed to fetch results: {res.text}")
                        else:
                            rows = res.json()
                            # results = rows if isinstance(rows, list) else [rows]
                            results = rows.get("results", [])

                            if not results:
                                st.warning("No result files found for this workflow.")
                            else:
                                st.markdown("### Individual Result Files")

                                # for r in results:
                                #     gcs_path = r["result_path"]

                                #     # Generate a signed download URL from orchestrator
                                #     try:
                                #         dl_resp = requests.get(
                                #             f"{API_URL}/download-url",
                                #             params={"gcs_path": gcs_path},
                                #             timeout=10,
                                #         )
                                #         if dl_resp.status_code == 200:
                                #             download_url = dl_resp.json()["download_url"]
                                #         else:
                                #             download_url = None
                                #     except Exception:
                                #         download_url = None

                                #     file_name = gcs_path.split("/")[-1]
                                #     created_at = r.get("created_at", "")

                                #     # Display result in a pretty card with download link
                                #     st.markdown(
                                #         f"""
                                #         <div style="
                                #             background-color: #f9f9f9;
                                #             border-radius: 12px;
                                #             padding: 16px;
                                #             margin-bottom: 12px;
                                #             box-shadow: 0 2px 6px rgba(0,0,0,0.1);
                                #             border: 1px solid #eee;
                                #         ">
                                #             <h5 style="margin: 0;">📄 {file_name}</h5>
                                #             <p style="margin: 5px 0; color: #666;">Created: {created_at}</p>
                                #             {"<a href='" + download_url + "' target='_blank' style='text-decoration: none; background-color: #2b9348; color: white; padding: 8px 15px; border-radius: 6px; font-weight: bold;'>⬇️ Download</a>" if download_url else "<p style='color:red'>Download link unavailable.</p>"}
                                #         </div>
                                #         """,
                                #         unsafe_allow_html=True,
                                #     )

                                for r in results:
                                    gcs_path = r["result_path"]
                                    file_name = gcs_path.split("/")[-1]
                                    created_at = r.get("created_at", "")
                                    download_url = r.get("download_url") # The URL is already in the response from /result

                                    # Use an expander for each result file
                                    with st.expander(f"📄 **{file_name}** (Created: {created_at})", expanded=True):
                                        if download_url:
                                            try:
                                                # Fetch the actual content from the signed URL
                                                content_resp = requests.get(download_url)
                                                content_resp.raise_for_status()  # Raise an error for bad responses (4xx or 5xx)

                                                # --- Display content based on file type ---

                                                # 1. Display CSV files as tables
                                                if file_name.endswith('.csv'):
                                                    df = pd.read_csv(StringIO(content_resp.text))
                                                    st.dataframe(df)

                                                # 2. Display JSON files as metrics or interactive JSON
                                                elif file_name.endswith('.json'):
                                                    data = content_resp.json()
                                                    # If it's a simple dictionary of metrics, display them nicely
                                                    if isinstance(data, dict) and all(isinstance(v, (int, float)) for v in data.values()):
                                                        st.write("##### Key Metrics")
                                                        cols = st.columns(len(data))
                                                        for i, (key, value) in enumerate(data.items()):
                                                            # Format the label nicely (e.g., "accuracy_score" -> "Accuracy Score")
                                                            formatted_label = key.replace("_", " ").title()
                                                            cols[i].metric(label=formatted_label, value=f"{value:.4f}")
                                                    # Otherwise, show the full JSON object
                                                    else:
                                                        st.json(data)
                                                
                                                # 3. Display other text files as plain text
                                                else:
                                                    st.text(content_resp.text)
                                                
                                                # Provide a download link as a fallback
                                                st.markdown(f'<a href="{download_url}" download="{file_name}" style="text-decoration: none; color: #1c83e1;">📥 Download Raw File</a>', unsafe_allow_html=True)

                                            except Exception as e:
                                                st.error(f"Could not load or display content for {file_name}: {e}")
                                        else:
                                            st.warning("Download link was not available for this file.")

                    model_gcs_path = result_info.get("model_gcs_path")
                    if model_gcs_path:
                        resp_dl = requests.get(f"{API_URL}/download-url", params={"gcs_path": model_gcs_path})
                        if resp_dl.status_code == 200:
                            download_url = resp_dl.json()["download_url"]
                            st.markdown(
                                f'<a href="{download_url}" download>'
                                f'<button style="background-color: #4CAF50; color: white; '
                                f'padding: 10px 20px; border: none; border-radius: 5px;">'
                                f'📥 Download Trained Model</button></a>',
                                unsafe_allow_html=True
                            )
                        else:
                            st.error(f"Failed to get model download URL: {resp_dl.text}")

    # ------------------------------
    # COLLABORATOR VIEW
    # ------------------------------
    elif role == "Collaborator":
        collaborator_id = st.text_input("Your ID (Collaborator)", value="ClientB")
        workflow_id = st.text_input("Workflow ID to join")

        if workflow_id:
            collaborator_datasets = st.file_uploader(
                "Upload your encrypted datasets (CSV)",
                type=["csv"],
                accept_multiple_files=True,
                key="collab_datasets_uploader"
            )

            if collaborator_datasets and st.button("Approve & Upload Datasets"):
                pubkey = client_crypto.get_executor_pubkey()
                uploaded_paths = []
                for ds in collaborator_datasets:
                    result = client_crypto.encrypt_and_upload(
                        workflow_id, pubkey, ds, ds.name, f"{collaborator_id}"
                    )
                    if result.get("upload_status_dataset") == 200:
                        uploaded_paths.append(result.get("ciphertext_gcs"))

                if uploaded_paths:
                    st.success(f"Uploaded {len(uploaded_paths)} encrypted datasets ✅")
                    resp = requests.post(
                        f"{API_URL}/workflows/{workflow_id}/approve",
                        params={"client_id": collaborator_id}
                    )
                    if resp.status_code == 200:
                        st.success("Workflow approved with your datasets ✅")
                    else:
                        st.error(f"Approval failed: {resp.text}")
        else:
            st.info("Enter a Workflow ID to join and upload your data.")


