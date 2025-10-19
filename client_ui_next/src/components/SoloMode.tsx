'use client';

import { useState, useEffect } from 'react';
import { useAppState, appActions } from '@/hooks/useAppState';
import { workflowApi, logsApi } from '@/lib/api';
import { encryptAndUploadDataset } from '@/lib/crypto';
import { FileUpload } from './FileUpload';
import { ExecutionLogs } from './ExecutionLogs';
import { ResultsDisplay } from './ResultsDisplay';
import { PlusIcon, PlayIcon, RefreshCwIcon } from 'lucide-react';

export function SoloMode() {
  const { state, dispatch } = useAppState();
  const [isCreatingWorkflow, setIsCreatingWorkflow] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [isRunning, setIsRunning] = useState(false);
  const [executionStarted, setExecutionStarted] = useState(false);
  const [logsPolling, setLogsPolling] = useState(false);

  // Create new workflow
  const handleCreateWorkflow = async () => {
    if (!state.currentUser) return;

    setIsCreatingWorkflow(true);
    try {
      const workflowId = crypto.randomUUID();
      const response = await workflowApi.createWorkflow(
        workflowId,
        state.currentUser,
        [state.currentUser]
      );

      dispatch(appActions.setWorkflowId(workflowId));
      dispatch(appActions.setWorkflowStatus('PENDING_APPROVAL'));
      dispatch(appActions.clearUploadedDatasets());
      dispatch(appActions.clearExecutionLogs());
      dispatch(appActions.clearResults());
      setExecutionStarted(false);
    } catch (error) {
      console.error('Failed to create workflow:', error);
      alert('Failed to create workflow. Please try again.');
    } finally {
      setIsCreatingWorkflow(false);
    }
  };

  // Handle file uploads
  const handleFilesSelected = async (files: File[]) => {
    if (!state.currentWorkflowId || !state.currentUser) return;

    setIsUploading(true);
    try {
      for (const file of files) {
        const result = await encryptAndUploadDataset(
          state.currentWorkflowId,
          file,
          state.currentUser
        );

        dispatch(appActions.addUploadedDataset({
          name: file.name,
          size: file.size,
          type: file.type,
          file: file,
        }));
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
    <div className="space-y-6">
      {/* Workflow Creation */}
      <div className="card">
        <h2 className="text-xl font-semibold mb-4">Run Fraud Detection Model</h2>

        {!state.currentWorkflowId ? (
          <div className="text-center py-8">
            <button
              onClick={handleCreateWorkflow}
              disabled={isCreatingWorkflow}
              className="btn-primary flex items-center space-x-2 mx-auto"
            >
              {isCreatingWorkflow ? (
                <RefreshCwIcon className="w-4 h-4 animate-spin" />
              ) : (
                <PlusIcon className="w-4 h-4" />
              )}
              <span>{isCreatingWorkflow ? 'Creating Workflow...' : 'Create New Workflow'}</span>
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
              <p className="font-medium text-blue-800">
                Workflow ID: <code className="bg-blue-100 px-2 py-1 rounded text-sm">{state.currentWorkflowId}</code>
              </p>
              <p className="text-blue-600 text-sm mt-1">
                Status: {state.workflowStatus || 'Ready'}
              </p>
            </div>

            {/* File Upload */}
            <div>
              <h3 className="font-medium mb-3">Upload Datasets</h3>
              <FileUpload
                onFilesSelected={handleFilesSelected}
                uploadedFiles={state.uploadedDatasets}
                onRemoveFile={(fileName) => {
                  // In a real app, you'd want to remove from state
                  // For now, we'll just filter it out
                }}
              />
            </div>

            {/* Run Workflow */}
            {state.uploadedDatasets.length > 0 && (
              <div className="pt-4 border-t">
                <button
                  onClick={handleRunWorkflow}
                  disabled={isRunning || isUploading}
                  className="btn-success flex items-center space-x-2"
                >
                  {isRunning ? (
                    <RefreshCwIcon className="w-4 h-4 animate-spin" />
                  ) : (
                    <PlayIcon className="w-4 h-4" />
                  )}
                  <span>
                    {isRunning ? 'Running Workflow...' : 'Run Fraud Detection'}
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
