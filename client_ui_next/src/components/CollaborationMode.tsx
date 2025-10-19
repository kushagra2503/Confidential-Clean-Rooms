'use client';

import { useState, useEffect } from 'react';
import { useAppState, appActions } from '@/hooks/useAppState';
import { workflowApi, logsApi } from '@/lib/api';
import { encryptAndUploadDataset } from '@/lib/crypto';
import { FileUpload } from './FileUpload';
import { ExecutionLogs } from './ExecutionLogs';
import { ResultsDisplay } from './ResultsDisplay';
import {
  PlusIcon,
  PlayIcon,
  RefreshCwIcon,
  CheckCircleIcon,
  UserIcon,
  UsersIcon
} from 'lucide-react';

export function CollaborationMode() {
  const { state, dispatch } = useAppState();
  const [activeView, setActiveView] = useState<'creator' | 'collaborator'>('creator');
  const [collaborators, setCollaborators] = useState('');
  const [existingWorkflowId, setExistingWorkflowId] = useState('');
  const [joinWorkflowId, setJoinWorkflowId] = useState('');
  const [isCreatingWorkflow, setIsCreatingWorkflow] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [isRunning, setIsRunning] = useState(false);
  const [isApproving, setIsApproving] = useState(false);
  const [executionStarted, setExecutionStarted] = useState(false);
  const [logsPolling, setLogsPolling] = useState(false);

  // Creator: Create new workflow
  const handleCreateWorkflow = async () => {
    if (!state.currentUser) return;

    setIsCreatingWorkflow(true);
    try {
      const workflowId = crypto.randomUUID();
      const collaboratorList = collaborators
        .split(',')
        .map(c => c.trim())
        .filter(c => c.length > 0);

      const response = await workflowApi.createWorkflow(
        workflowId,
        state.currentUser,
        [state.currentUser, ...collaboratorList]
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

  // Creator: Use existing workflow
  const handleUseExistingWorkflow = () => {
    if (existingWorkflowId.trim()) {
      dispatch(appActions.setWorkflowId(existingWorkflowId.trim()));
      dispatch(appActions.setWorkflowStatus('PENDING_APPROVAL'));
      dispatch(appActions.clearUploadedDatasets());
      dispatch(appActions.clearExecutionLogs());
      dispatch(appActions.clearResults());
      setExecutionStarted(false);
    }
  };

  // Creator/Collaborator: Handle file uploads
  const handleFilesSelected = async (files: File[]) => {
    if (!state.currentWorkflowId || !state.currentUser) return;

    setIsUploading(true);
    try {
      for (const file of files) {
        await encryptAndUploadDataset(
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

  // Creator: Submit workflow for approval
  const handleSubmitWorkflow = async () => {
    if (!state.currentWorkflowId || !state.currentUser) return;

    try {
      await workflowApi.approveWorkflow(state.currentWorkflowId, state.currentUser);
      dispatch(appActions.setWorkflowStatus('APPROVED_BY_CREATOR'));
    } catch (error) {
      console.error('Failed to submit workflow:', error);
      alert('Failed to submit workflow. Please try again.');
    }
  };

  // Creator: Run collaborative workflow
  const handleRunWorkflow = async () => {
    if (!state.currentWorkflowId || !state.currentUser) return;

    const collaboratorList = collaborators
      .split(',')
      .map(c => c.trim())
      .filter(c => c.length > 0);

    setIsRunning(true);
    setExecutionStarted(true);
    dispatch(appActions.clearExecutionLogs());

    try {
      await workflowApi.runWorkflow(
        state.currentWorkflowId,
        state.currentUser,
        [state.currentUser, ...collaboratorList]
      );

      dispatch(appActions.setWorkflowStatus('RUNNING'));

      // Start polling logs
      setLogsPolling(true);
      pollLogs();

    } catch (error) {
      console.error('Failed to run workflow:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      if (errorMessage.includes('not yet approved')) {
        alert('Workflow is not approved by all collaborators yet.');
      } else {
        alert('Failed to run workflow. Please try again.');
      }
      setExecutionStarted(false);
    } finally {
      setIsRunning(false);
    }
  };

  // Collaborator: Join and approve workflow
  const handleJoinWorkflow = async () => {
    if (!joinWorkflowId.trim() || !state.currentUser) return;

    setIsApproving(true);
    try {
      // First upload datasets
      // Note: In a real app, collaborator would have their own datasets

      // Then approve the workflow
      await workflowApi.approveWorkflow(joinWorkflowId.trim(), state.currentUser);

      dispatch(appActions.setWorkflowId(joinWorkflowId.trim()));
      dispatch(appActions.setWorkflowStatus('APPROVED'));
      alert('Successfully joined and approved the workflow!');
    } catch (error) {
      console.error('Failed to join workflow:', error);
      alert('Failed to join workflow. Please check the workflow ID and try again.');
    } finally {
      setIsApproving(false);
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
      {/* Role Selection */}
      <div className="flex space-x-1 bg-gray-100 p-1 rounded-lg">
        <button
          onClick={() => setActiveView('creator')}
          className={`flex-1 flex items-center justify-center space-x-2 py-2 px-4 rounded-md font-medium transition-colors ${
            activeView === 'creator'
              ? 'bg-blue-600 text-white'
              : 'text-gray-600 hover:bg-gray-200'
          }`}
        >
          <UserIcon className="w-4 h-4" />
          <span>Creator</span>
        </button>
        <button
          onClick={() => setActiveView('collaborator')}
          className={`flex-1 flex items-center justify-center space-x-2 py-2 px-4 rounded-md font-medium transition-colors ${
            activeView === 'collaborator'
              ? 'bg-blue-600 text-white'
              : 'text-gray-600 hover:bg-gray-200'
          }`}
        >
          <UsersIcon className="w-4 h-4" />
          <span>Collaborator</span>
        </button>
      </div>

      {/* Creator View */}
      {activeView === 'creator' && (
        <div className="space-y-6">
          <div className="card">
            <h2 className="text-xl font-semibold mb-4">Creator Dashboard</h2>

            {/* Workflow Setup */}
            {!state.currentWorkflowId ? (
              <div className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <button
                    onClick={handleCreateWorkflow}
                    disabled={isCreatingWorkflow}
                    className="btn-primary flex items-center justify-center space-x-2"
                  >
                    {isCreatingWorkflow ? (
                      <RefreshCwIcon className="w-4 h-4 animate-spin" />
                    ) : (
                      <PlusIcon className="w-4 h-4" />
                    )}
                    <span>Create New Workflow</span>
                  </button>

                  <div className="space-y-2">
                    <input
                      type="text"
                      placeholder="Enter existing workflow ID"
                      value={existingWorkflowId}
                      onChange={(e) => setExistingWorkflowId(e.target.value)}
                      className="input-field"
                    />
                    <button
                      onClick={handleUseExistingWorkflow}
                      disabled={!existingWorkflowId.trim()}
                      className="btn-secondary w-full"
                    >
                      Use Existing Workflow
                    </button>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Collaborators (comma-separated)
                  </label>
                  <input
                    type="text"
                    placeholder="e.g., ClientB, ClientC, ClientD"
                    value={collaborators}
                    onChange={(e) => setCollaborators(e.target.value)}
                    className="input-field"
                  />
                </div>
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
                  <p className="text-blue-600 text-sm">
                    Collaborators: {state.currentUser}, {collaborators}
                  </p>
                </div>

                {/* File Upload */}
                <div>
                  <h3 className="font-medium mb-3">Upload Your Datasets</h3>
                  <FileUpload
                    onFilesSelected={handleFilesSelected}
                    uploadedFiles={state.uploadedDatasets}
                  />
                </div>

                {/* Submit for Approval */}
                {state.uploadedDatasets.length > 0 && (
                  <div className="pt-4 border-t">
                    <button
                      onClick={handleSubmitWorkflow}
                      className="btn-success flex items-center space-x-2 mr-4"
                    >
                      <CheckCircleIcon className="w-4 h-4" />
                      <span>Submit for Approval</span>
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Run Workflow */}
          {state.currentWorkflowId && state.workflowStatus?.includes('APPROVED') && (
            <div className="card">
              <h3 className="text-lg font-semibold mb-4">Run Collaborative Workflow</h3>
              <button
                onClick={handleRunWorkflow}
                disabled={isRunning}
                className="btn-success flex items-center space-x-2"
              >
                {isRunning ? (
                  <RefreshCwIcon className="w-4 h-4 animate-spin" />
                ) : (
                  <PlayIcon className="w-4 h-4" />
                )}
                <span>Run Fraud Detection</span>
              </button>
            </div>
          )}
        </div>
      )}

      {/* Collaborator View */}
      {activeView === 'collaborator' && (
        <div className="card">
          <h2 className="text-xl font-semibold mb-4">Collaborator Dashboard</h2>

          {!state.currentWorkflowId ? (
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Workflow ID to Join
                </label>
                <input
                  type="text"
                  placeholder="Enter workflow ID from creator"
                  value={joinWorkflowId}
                  onChange={(e) => setJoinWorkflowId(e.target.value)}
                  className="input-field"
                />
              </div>

              <button
                onClick={handleJoinWorkflow}
                disabled={!joinWorkflowId.trim() || isApproving}
                className="btn-primary flex items-center space-x-2"
              >
                {isApproving ? (
                  <RefreshCwIcon className="w-4 h-4 animate-spin" />
                ) : (
                  <CheckCircleIcon className="w-4 h-4" />
                )}
                <span>Join & Approve Workflow</span>
              </button>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                <p className="font-medium text-green-800">
                  Successfully joined workflow: <code className="bg-green-100 px-2 py-1 rounded text-sm">{state.currentWorkflowId}</code>
                </p>
                <p className="text-green-600 text-sm mt-1">
                  Status: {state.workflowStatus || 'Approved'}
                </p>
              </div>

              {/* File Upload for Collaborator */}
              <div>
                <h3 className="font-medium mb-3">Upload Your Datasets</h3>
                <FileUpload
                  onFilesSelected={handleFilesSelected}
                  uploadedFiles={state.uploadedDatasets}
                />
              </div>
            </div>
          )}
        </div>
      )}

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
