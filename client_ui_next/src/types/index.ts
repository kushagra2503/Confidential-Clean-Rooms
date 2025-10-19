// API Response Types
export interface ApiResponse<T = unknown> {
  status?: string;
  data?: T;
  error?: string;
}

// Workflow Types
export interface Workflow {
  workflow_id: string;
  creator: string;
  collaborator: string[];
  workload_path: string;
  status: 'PENDING_APPROVAL' | 'APPROVED' | 'REJECTED' | 'RUNNING' | 'COMPLETED';
  created_at: string;
}

export interface WorkflowResult {
  workflow_id: string;
  result_path: string;
  executed_notebook_path: string;
  created_at: string;
  download_url?: string;
}

export interface ExecutionResult {
  status: string;
  executed_notebook?: string;
  result_json_paths?: string[];
  model_gcs_path?: string;
}

// Dataset and Upload Types
export interface DatasetUpload {
  workflow_id: string;
  filename: string;
  dataset_id: string;
  owner: string;
  ciphertext_gcs: string;
  wrapped_dek_gcs: string;
  upload_status_dataset: number;
  upload_status_dek: number;
}

// Attestation Types
export interface AttestationResponse {
  public_key_pem: string;
  attestation_token: string;
}

// Log Types
export interface WorkflowLogs {
  logs: string[];
}

// File Types
export interface UploadedFile {
  name: string;
  size: number;
  type: string;
  file: File;
}

// UI State Types
export interface AppState {
  currentUser: string | null;
  currentRole: 'creator' | 'collaborator' | null;
  currentWorkflowId: string | null;
  uploadedDatasets: UploadedFile[];
  workflowStatus: string | null;
  executionLogs: string[];
  results: WorkflowResult[];
}

// Form Types
export interface CreateWorkflowForm {
  creator: string;
  collaborators: string;
}

export interface JoinWorkflowForm {
  collaboratorId: string;
  workflowId: string;
}
