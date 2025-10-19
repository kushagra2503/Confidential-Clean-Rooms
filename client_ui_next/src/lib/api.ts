import axios from 'axios';
import {
  Workflow,
  WorkflowResult,
  ExecutionResult,
  AttestationResponse,
  WorkflowLogs,
  ApiResponse
} from '@/types';

// API Configuration
const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8080';

const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: 30000, // 30 seconds for long-running operations
});

// Request interceptor for logging
api.interceptors.request.use(
  (config) => {
    console.log(`API Request: ${config.method?.toUpperCase()} ${config.url}`);
    return config;
  },
  (error) => {
    console.error('API Request Error:', error);
    return Promise.reject(error);
  }
);

// Response interceptor for error handling
api.interceptors.response.use(
  (response) => {
    return response;
  },
  (error) => {
    console.error('API Response Error:', error);
    if (error.response) {
      // Server responded with error status
      const message = error.response.data?.detail || error.response.data?.message || 'API Error';
      throw new Error(message);
    } else if (error.request) {
      // Network error
      throw new Error('Network error - please check your connection');
    } else {
      // Other error
      throw new Error(error.message || 'Unknown API error');
    }
  }
);

// Workflow API
export const workflowApi = {
  // Create a new workflow
  createWorkflow: async (
    workflowId: string,
    creator: string,
    collaborators: string[]
  ): Promise<{ workflow_id: string; status: string }> => {
    const params = new URLSearchParams({
      workflow_id: workflowId,
      creator,
    });

    // Add collaborators as separate parameters
    collaborators.forEach((collaborator, index) => {
      params.append('collaborator', collaborator);
    });

    const response = await api.post('/workflows', null, { params });
    return response.data;
  },

  // Get workflow details
  getWorkflow: async (
    workflowId: string,
    creator: string
  ): Promise<Workflow> => {
    const params = new URLSearchParams({
      workflow_id: workflowId,
      creator,
    });

    const response = await api.get(`/workflows/${workflowId}`, { params });
    return response.data;
  },

  // Approve workflow
  approveWorkflow: async (
    workflowId: string,
    clientId: string
  ): Promise<{ workflow_id: string; status: string }> => {
    const params = new URLSearchParams({
      workflow_id: workflowId,
      client_id: clientId,
    });

    const response = await api.post(`/workflows/${workflowId}/approve`, null, { params });
    return response.data;
  },

  // Reject workflow
  rejectWorkflow: async (
    workflowId: string,
    clientId: string
  ): Promise<{ workflow_id: string; status: string }> => {
    const params = new URLSearchParams({
      workflow_id: workflowId,
      client_id: clientId,
    });

    const response = await api.post(`/workflows/${workflowId}/reject`, null, { params });
    return response.data;
  },

  // Run workflow
  runWorkflow: async (
    workflowId: string,
    creator: string,
    collaborators: string[]
  ): Promise<ExecutionResult> => {
    const params = new URLSearchParams({
      workflow_id: workflowId,
      creator,
    });

    // Add collaborators as separate parameters
    collaborators.forEach((collaborator) => {
      params.append('collaborators', collaborator);
    });

    const response = await api.post(`/workflows/${workflowId}/run`, null, { params });
    return response.data;
  },

  // Get workflow results
  getWorkflowResults: async (
    workflowId: string
  ): Promise<{ workflow_id: string; results: WorkflowResult[] }> => {
    const response = await api.get(`/workflows/${workflowId}/result`);
    return response.data;
  },
};

// Upload API
export const uploadApi = {
  // Get signed upload URL
  getUploadUrl: async (
    workflowId: string,
    datasetId: string,
    filename: string,
    fileType: 'dataset' | 'key',
    owner: string
  ): Promise<{ upload_url: string; gcs_path: string; id: string }> => {
    const params = new URLSearchParams({
      workflow_id: workflowId,
      dataset_id: datasetId,
      filename,
      file_type: fileType,
      owner,
    });

    const response = await api.post('/upload-url', null, { params });
    return response.data;
  },

  // Get signed download URL
  getDownloadUrl: async (
    gcsPath: string
  ): Promise<{ download_url: string }> => {
    const params = new URLSearchParams({
      gcs_path: gcsPath,
    });

    const response = await api.get('/download-url', { params });
    return response.data;
  },
};

// Attestation API
export const attestationApi = {
  // Get executor public key and attestation
  getExecutorPubkey: async (): Promise<AttestationResponse> => {
    const response = await api.get('/executor-pubkey');
    return response.data;
  },
};

// Logs API
export const logsApi = {
  // Get workflow logs
  getWorkflowLogs: async (workflowId: string): Promise<WorkflowLogs> => {
    const response = await api.get(`/logs/${workflowId}`);
    return response.data;
  },
};

// Utility functions
export const apiUtils = {
  // Upload file to signed URL
  uploadToSignedUrl: async (
    signedUrl: string,
    data: ArrayBuffer | Blob,
    contentType: string = 'application/octet-stream'
  ): Promise<void> => {
    await axios.put(signedUrl, data, {
      headers: {
        'Content-Type': contentType,
      },
    });
  },

  // Download file from signed URL
  downloadFromSignedUrl: async (signedUrl: string): Promise<ArrayBuffer> => {
    const response = await axios.get(signedUrl, {
      responseType: 'arraybuffer',
    });
    return response.data;
  },
};
