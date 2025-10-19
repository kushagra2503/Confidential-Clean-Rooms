'use client';

import { useState, useEffect } from 'react';
import { useAppState, appActions } from '@/hooks/useAppState';
import { workflowApi, logsApi } from '@/lib/api';
import { encryptAndUploadDataset } from '@/lib/crypto';
import { FileUpload } from './FileUpload';
import { ExecutionLogs } from './ExecutionLogs';
import { ResultsDisplay } from './ResultsDisplay';
import { PlusIcon, PlayIcon, RefreshCwIcon, UserIcon, DatabaseIcon, FileIcon, CheckCircleIcon } from 'lucide-react';

export function SoloMode() {
  const { state, dispatch } = useAppState();
  const [clientId, setClientId] = useState('Auditor');
  const [isCreatingWorkflow, setIsCreatingWorkflow] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [isRunning, setIsRunning] = useState(false);
  const [executionStarted, setExecutionStarted] = useState(false);
  const [logsPolling, setLogsPolling] = useState(false);

  // Create new workflow
  const handleCreateWorkflow = async () => {
    setIsCreatingWorkflow(true);
    try {
      const workflowId = crypto.randomUUID();
      dispatch(appActions.setWorkflowId(workflowId));
      dispatch(appActions.setWorkflowStatus('PENDING_APPROVAL'));
      dispatch(appActions.clearUploadedDatasets());
      dispatch(appActions.clearExecutionLogs());
      dispatch(appActions.clearResults());
      setExecutionStarted(false);
      alert(`Workflow created with ID: ${workflowId}`);
    } catch (error) {
      console.error('Failed to create workflow:', error);
      alert('Failed to create workflow. Please try again.');
    } finally {
      setIsCreatingWorkflow(false);
    }
  };

  // Handle file uploads and workflow submission
  const handleUploadDatasets = async (files: File[]) => {
    if (!state.currentWorkflowId) return;

    setIsUploading(true);
    try {
      // Get executor public key
      const pubkey = await attestationApi.getExecutorPubkey();

      const uploadedPaths: string[] = [];

      // Encrypt and upload each dataset
      for (const file of files) {
        const result = await encryptAndUploadDataset(
          state.currentWorkflowId,
          file,
          clientId
        );

        if (result.upload_status_dataset === 200) {
          uploadedPaths.push(result.ciphertext_gcs);
        }

        dispatch(appActions.addUploadedDataset({
          name: file.name,
          size: file.size,
          type: file.type,
          file: file,
        }));
      }

      if (uploadedPaths.length > 0) {
        // Submit workflow to orchestrator
        await workflowApi.createWorkflow(
          state.currentWorkflowId,
          clientId,
          [clientId]
        );

        // Auto-approve the workflow
        await workflowApi.approveWorkflow(state.currentWorkflowId, clientId);

        alert(`Uploaded ${uploadedPaths.length} encrypted datasets ✅`);
      }
    } catch (error) {
      console.error('Failed to upload files:', error);
      alert('Failed to upload files. Please try again.');
    } finally {
      setIsUploading(false);
    }
  };

  // Run workflow
  const handleRunWorkflow = async () => {
    if (!state.currentWorkflowId || !state.currentUser) return;

    setIsRunning(true);
    setExecutionStarted(true);
    dispatch(appActions.clearExecutionLogs());

    try {
      const response = await workflowApi.runWorkflow(
        state.currentWorkflowId,
        state.currentUser,
        [state.currentUser]
      );

      dispatch(appActions.setWorkflowStatus('RUNNING'));

      // Start polling logs
      setLogsPolling(true);
      pollLogs();

    } catch (error) {
      console.error('Failed to run workflow:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      if (errorMessage.includes('not yet approved')) {
        alert('Workflow is not approved yet. Please ensure all collaborators have approved.');
      } else {
        alert('Failed to run workflow. Please try again.');
      }
      setExecutionStarted(false);
    } finally {
      setIsRunning(false);
    }
  };

  // Poll logs
  const pollLogs = async () => {
    if (!state.currentWorkflowId) return;

    try {
      const logsResponse = await logsApi.getWorkflowLogs(state.currentWorkflowId);
      dispatch(appActions.setExecutionLogs(logsResponse.logs));

      // Check if execution is complete
      const hasCompleted = logsResponse.logs.some(log =>
        log.includes('Notebook executed') || log.includes('Execution finished')
      );

      if (hasCompleted) {
        setLogsPolling(false);
        dispatch(appActions.setWorkflowStatus('COMPLETED'));

        // Fetch results
        try {
          const resultsResponse = await workflowApi.getWorkflowResults(state.currentWorkflowId);
          dispatch(appActions.setResults(resultsResponse.results));
        } catch (resultsError) {
          console.error('Failed to fetch results:', resultsError);
        }
      } else {
        // Continue polling
        setTimeout(pollLogs, 2000);
      }
    } catch (error) {
      console.error('Failed to poll logs:', error);
      setTimeout(pollLogs, 2000);
    }
  };

  // Stop polling when component unmounts
  useEffect(() => {
    return () => {
      setLogsPolling(false);
    };
  }, []);

  return (
    <div className="space-y-8">
      {/* Workflow Creation Section */}
      <div className="card-subtle">
        <div className="flex items-center space-x-3 mb-6">
          <div className="bg-gradient-to-r from-blue-500 to-indigo-500 p-3 rounded-xl">
            <PlayIcon className="w-6 h-6 text-white" />
          </div>
          <div>
            <h2 className="text-2xl font-bold gradient-text">Run ML Workload</h2>
            <p className="text-gray-600">Execute secure machine learning workflows in confidential computing</p>
          </div>
        </div>

        {/* Client ID Input */}
        <div className="mb-6">
          <label htmlFor="clientId" className="block text-sm font-semibold text-gray-700 mb-3">
            Your Client ID
          </label>
          <div className="relative">
            <UserIcon className="absolute left-4 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
            <input
              id="clientId"
              type="text"
              value={clientId}
              onChange={(e) => setClientId(e.target.value)}
              className="input-field pl-12"
              placeholder="Enter your client ID"
            />
          </div>
        </div>

        {!state.currentWorkflowId ? (
          <div className="text-center py-12">
            <div className="mb-6">
              <div className="bg-gradient-to-r from-blue-100 to-indigo-100 p-4 rounded-2xl inline-block mb-4">
                <PlusIcon className="w-12 h-12 text-blue-600 animate-float" />
              </div>
              <h3 className="text-xl font-semibold text-gray-800 mb-2">Start New Workflow</h3>
              <p className="text-gray-600">Create a secure workflow for your machine learning tasks</p>
            </div>
            <button
              onClick={handleCreateWorkflow}
              disabled={isCreatingWorkflow}
              className="btn-primary flex items-center space-x-3 mx-auto px-8 py-4 text-lg"
            >
              {isCreatingWorkflow ? (
                <RefreshCwIcon className="w-5 h-5 animate-spin" />
              ) : (
                <PlusIcon className="w-5 h-5" />
              )}
              <span>{isCreatingWorkflow ? 'Creating Workflow...' : 'Create Solo Workflow'}</span>
            </button>
          </div>
        ) : (
          <div className="space-y-6">
            {/* Workflow Status */}
            <div className="bg-gradient-to-r from-blue-50 to-indigo-50 border-2 border-blue-200 rounded-2xl p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-gray-800">Active Workflow</h3>
                <div className="status-badge status-info">
                  <div className="w-2 h-2 bg-blue-500 rounded-full mr-2 animate-pulse-soft"></div>
                  {state.workflowStatus || 'Ready'}
                </div>
              </div>
              <div className="bg-white/60 rounded-xl p-4">
                <p className="font-mono text-sm text-gray-700 break-all">
                  <span className="font-semibold">Workflow ID:</span> {state.currentWorkflowId}
                </p>
              </div>
            </div>

            {/* File Upload Section */}
            {state.uploadedDatasets.length === 0 && (
              <div className="space-y-4">
                <div className="flex items-center space-x-3 mb-4">
                  <div className="bg-gradient-to-r from-emerald-500 to-green-500 p-2 rounded-lg">
                    <DatabaseIcon className="w-5 h-5 text-white" />
                  </div>
                  <h3 className="text-lg font-semibold text-gray-800">Upload Datasets</h3>
                </div>
                <p className="text-gray-600 mb-4">Upload one or more CSV datasets for your machine learning workflow</p>
                <FileUpload
                  onFilesSelected={handleUploadDatasets}
                  uploadedFiles={state.uploadedDatasets}
                  acceptOnlyCsv={true}
                />
              </div>
            )}

            {/* Uploaded Datasets Display */}
            {state.uploadedDatasets.length > 0 && (
              <div className="space-y-4">
                <div className="flex items-center space-x-3 mb-4">
                  <div className="bg-gradient-to-r from-emerald-500 to-green-500 p-2 rounded-lg">
                    <CheckCircleIcon className="w-5 h-5 text-white" />
                  </div>
                  <h3 className="text-lg font-semibold text-gray-800">Uploaded Datasets</h3>
                </div>
                <div className="grid gap-3">
                  {state.uploadedDatasets.map((dataset, index) => (
                    <div key={index} className="bg-gradient-to-r from-emerald-50 to-green-50 border-2 border-emerald-200 rounded-xl p-4">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center space-x-3">
                          <div className="bg-emerald-100 p-2 rounded-lg">
                            <FileIcon className="w-4 h-4 text-emerald-600" />
                          </div>
                          <div>
                            <p className="font-semibold text-emerald-800">{dataset.name}</p>
                            <p className="text-emerald-600 text-sm">{(dataset.size / 1024).toFixed(1)} KB</p>
                          </div>
                        </div>
                        <CheckCircleIcon className="w-5 h-5 text-emerald-600" />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Run Workflow Button */}
            {state.uploadedDatasets.length > 0 && (
              <div className="pt-6 border-t border-gray-200">
                <button
                  onClick={handleRunWorkflow}
                  disabled={isRunning || isUploading}
                  className="btn-success flex items-center space-x-3 w-full justify-center py-4 text-lg"
                >
                  {isRunning ? (
                    <RefreshCwIcon className="w-5 h-5 animate-spin" />
                  ) : (
                    <PlayIcon className="w-5 h-5" />
                  )}
                  <span>
                    {isRunning ? 'Running Workflow...' : '🚀 Run Solo Workflow'}
                  </span>
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Execution Logs */}
      {executionStarted && (
        <div className="card">
          <ExecutionLogs logs={state.executionLogs} isPolling={logsPolling} />
        </div>
      )}

      {/* Results */}
      {state.results.length > 0 && (
        <div className="card">
          <ResultsDisplay results={state.results} />
        </div>
      )}
    </div>
  );
}
