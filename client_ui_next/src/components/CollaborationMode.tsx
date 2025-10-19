'use client';

import React, { useState, useEffect } from 'react';
import {
  PlusIcon,
  PlayIcon,
  RefreshCwIcon,
  CheckCircleIcon,
  UserIcon,
  UsersIcon,
  DatabaseIcon,
  FileIcon,
  TrashIcon
} from 'lucide-react';
import { useAppState, appActions } from '../hooks/useAppState';
import { encryptAndUploadDataset } from '../lib/crypto';
import { workflowApi, attestationApi, logsApi } from '../lib/api';
import { FileUpload } from './FileUpload';
import { ExecutionLogs } from './ExecutionLogs';
import { ResultsDisplay } from './ResultsDisplay';

export function CollaborationMode() {
  const { state, dispatch } = useAppState();
  const [role, setRole] = useState<'Creator' | 'Collaborator'>('Creator');
  const [creatorId, setCreatorId] = useState('Auditor');
  const [collaboratorId, setCollaboratorId] = useState('ClientB');
  const [collaborators, setCollaborators] = useState('ClientB');
  const [existingWorkflowId, setExistingWorkflowId] = useState('');
  const [joinWorkflowId, setJoinWorkflowId] = useState('');
  const [workflowToRun, setWorkflowToRun] = useState('');
  const [isCreatingWorkflow, setIsCreatingWorkflow] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [isRunning, setIsRunning] = useState(false);
  const [isApproving, setIsApproving] = useState(false);
  const [executionStarted, setExecutionStarted] = useState(false);
  const [logsPolling, setLogsPolling] = useState(false);

  // Poll logs function
  const pollLogs = async (workflowId: string) => {
    const poll = async () => {
      if (!logsPolling) return;

      try {
        const response = await logsApi.getWorkflowLogs(workflowId);
        dispatch(appActions.setExecutionLogs(response.logs));

        // Continue polling if not completed
        if (!response.logs.some((log: string) => log.includes('Notebook executed'))) {
          setTimeout(poll, 2000);
        } else {
          setLogsPolling(false);
          // Fetch results when execution is complete
          try {
            const results = await workflowApi.getWorkflowResults(workflowId);
            dispatch(appActions.setResults(results.results));
          } catch (error) {
            console.error('Failed to fetch results:', error);
          }
        }
      } catch (error) {
        console.error('Failed to poll logs:', error);
        setTimeout(poll, 2000);
      }
    };

    poll();
  };

  // Cleanup polling on unmount
  useEffect(() => {
    return () => {
      setLogsPolling(false);
    };
  }, []);

  // Creator: Create new workflow
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

  // Creator: Handle file uploads and workflow submission
  const handleCreatorUploadDatasets = async (files: File[]) => {
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
          creatorId
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
        alert(`Uploaded ${uploadedPaths.length} encrypted datasets ✅`);
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
    if (!state.currentWorkflowId) return;

    try {
      const collaboratorList = [creatorId, ...collaborators.split(',').map(c => c.trim()).filter(c => c.length > 0)];

      // Submit workflow to orchestrator
      await workflowApi.createWorkflow(
        state.currentWorkflowId,
        creatorId,
        collaboratorList
      );

      // Auto-approve creator
      await workflowApi.approveWorkflow(state.currentWorkflowId, creatorId);

      alert('Workflow submitted ✅ Waiting for collaborator approvals.');
    } catch (error) {
      console.error('Failed to submit workflow:', error);
      alert('Error submitting workflow. Please try again.');
    }
  };

  // Creator: Run collaborative workflow
  const handleRunWorkflow = async () => {
    const workflowIdToRun = workflowToRun || state.currentWorkflowId;
    if (!workflowIdToRun) return;

    const collaboratorList = [creatorId, ...collaborators.split(',').map(c => c.trim()).filter(c => c.length > 0)];

    setIsRunning(true);
    setExecutionStarted(true);
    dispatch(appActions.clearExecutionLogs());

    try {
      const response = await workflowApi.runWorkflow(
        workflowIdToRun,
        creatorId,
        collaboratorList
      );

      dispatch(appActions.setWorkflowStatus('RUNNING'));

      // Start polling logs
      setLogsPolling(true);
      pollLogs(workflowIdToRun);

    } catch (error: any) {
      console.error('Failed to run workflow:', error);
      if (error.message?.includes('not yet approved')) {
        alert('⚠️ Workflow not yet approved by all collaborators.');
      } else {
        alert('Execution failed. Please try again.');
      }
      setExecutionStarted(false);
    } finally {
      setIsRunning(false);
    }
  };

  // Collaborator: Join and approve workflow
  const handleJoinWorkflow = async (files: File[]) => {
    if (!joinWorkflowId.trim()) return;

    setIsApproving(true);
    try {
      // Upload datasets if provided
      if (files.length > 0) {
        const pubkey = await attestationApi.getExecutorPubkey();

        for (const file of files) {
          await encryptAndUploadDataset(
            joinWorkflowId.trim(),
            file,
            collaboratorId
          );

          dispatch(appActions.addUploadedDataset({
            name: file.name,
            size: file.size,
            type: file.type,
            file: file,
          }));
        }
      }

      // Approve workflow
      await workflowApi.approveWorkflow(joinWorkflowId.trim(), collaboratorId);

      dispatch(appActions.setWorkflowId(joinWorkflowId.trim()));
      dispatch(appActions.setWorkflowStatus('APPROVED'));

      alert('Workflow approved with your datasets ✅');
    } catch (error) {
      console.error('Failed to join workflow:', error);
      alert('Failed to join workflow. Please check the workflow ID and try again.');
    } finally {
      setIsApproving(false);
    }
  };

  return (
    <div className="space-y-8">
      <div className="card-subtle">
        <div className="flex items-center space-x-3 mb-6">
          <div className="bg-gradient-to-r from-purple-500 to-indigo-500 p-3 rounded-xl">
            <UsersIcon className="w-6 h-6 text-white" />
          </div>
          <div>
            <h2 className="text-2xl font-bold gradient-text">Collaborative Workflow</h2>
            <p className="text-gray-600">Secure multi-party machine learning workflows</p>
          </div>
        </div>

        {/* Role Selection */}
        <div className="mb-6">
          <label className="block text-sm font-semibold text-gray-700 mb-3">
            Select Your Role
          </label>
          <div className="flex space-x-4">
            <label className="flex items-center">
              <input
                type="radio"
                value="Creator"
                checked={role === 'Creator'}
                onChange={(e) => setRole(e.target.value as 'Creator' | 'Collaborator')}
                className="mr-3"
              />
              <div className="flex items-center space-x-2">
                <UserIcon className="w-5 h-5 text-blue-600" />
                <span className="font-medium">Creator</span>
              </div>
            </label>
            <label className="flex items-center">
              <input
                type="radio"
                value="Collaborator"
                checked={role === 'Collaborator'}
                onChange={(e) => setRole(e.target.value as 'Creator' | 'Collaborator')}
                className="mr-3"
              />
              <div className="flex items-center space-x-2">
                <UsersIcon className="w-5 h-5 text-green-600" />
                <span className="font-medium">Collaborator</span>
              </div>
            </label>
          </div>
        </div>

        {/* Creator View */}
        {role === 'Creator' && (
          <div>
            <div className="mb-4">
              <label htmlFor="creatorId" className="block text-sm font-medium text-gray-700 mb-2">
                Your ID (Creator)
              </label>
              <input
                id="creatorId"
                type="text"
                value={creatorId}
                onChange={(e) => setCreatorId(e.target.value)}
                className="input-field"
                placeholder="Enter your creator ID"
              />
            </div>

            {/* Workflow Setup */}
            <div className="mb-6">
              <h3 className="text-lg font-semibold mb-4">Workflow Setup</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                <button
                  onClick={handleCreateWorkflow}
                  disabled={isCreatingWorkflow}
                  className="btn-primary flex items-center justify-center space-x-2"
                >
                  <PlusIcon className="w-4 h-4" />
                  <span>🆕 Create New Workflow</span>
                </button>

                <div className="space-y-2">
                  <input
                    type="text"
                    placeholder="Or enter existing Workflow ID to continue"
                    value={existingWorkflowId}
                    onChange={(e) => setExistingWorkflowId(e.target.value)}
                    className="input-field"
                  />
                  {existingWorkflowId && (
                    <p className="text-sm text-blue-600">Using existing workflow: {existingWorkflowId}</p>
                  )}
                </div>
              </div>

              {/* Upload creator datasets */}
              {state.currentWorkflowId && (
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Add Collaborator IDs (comma-separated)
                    </label>
                    <input
                      type="text"
                      placeholder="ClientB"
                      value={collaborators}
                      onChange={(e) => setCollaborators(e.target.value)}
                      className="input-field"
                    />
                  </div>

                  <div>
                    <h4 className="font-medium mb-3">Upload one or more datasets (CSV)</h4>
                    <FileUpload
                      onFilesSelected={handleCreatorUploadDatasets}
                      uploadedFiles={state.uploadedDatasets}
                      acceptOnlyCsv={true}
                    />
                  </div>

                  {/* Submit workflow */}
                  {state.uploadedDatasets.length > 0 && (
                    <div className="pt-4 border-t border-gray-200">
                      <button
                        onClick={handleSubmitWorkflow}
                        className="btn-success flex items-center space-x-2"
                      >
                        <CheckCircleIcon className="w-4 h-4" />
                        <span>Submit Workflow</span>
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Run approved workflow */}
            {state.currentWorkflowId && (
              <div className="mb-6">
                <h3 className="text-lg font-semibold mb-4">▶️ Run Approved Workflow</h3>
                <div className="space-y-4">
                  <input
                    type="text"
                    placeholder="Enter Workflow ID to Run"
                    value={workflowToRun}
                    onChange={(e) => setWorkflowToRun(e.target.value)}
                    className="input-field"
                  />

                  <button
                    onClick={handleRunWorkflow}
                    disabled={isRunning}
                    className="btn-success flex items-center space-x-3 w-full justify-center py-4 text-lg"
                  >
                    {isRunning ? (
                      <RefreshCwIcon className="w-5 h-5 animate-spin" />
                    ) : (
                      <PlayIcon className="w-5 h-5" />
                    )}
                    <span>Run Collaborative Workflow</span>
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Collaborator View */}
        {role === 'Collaborator' && (
          <div>
            <div className="mb-4">
              <label htmlFor="collaboratorId" className="block text-sm font-medium text-gray-700 mb-2">
                Your ID (Collaborator)
              </label>
              <input
                id="collaboratorId"
                type="text"
                value={collaboratorId}
                onChange={(e) => setCollaboratorId(e.target.value)}
                className="input-field"
                placeholder="Enter your collaborator ID"
              />
            </div>

            <div className="mb-4">
              <label htmlFor="workflowId" className="block text-sm font-medium text-gray-700 mb-2">
                Workflow ID to join
              </label>
              <input
                id="workflowId"
                type="text"
                value={joinWorkflowId}
                onChange={(e) => setJoinWorkflowId(e.target.value)}
                className="input-field"
                placeholder="Enter workflow ID from creator"
              />
            </div>

            {joinWorkflowId && (
              <div>
                <h4 className="font-medium mb-3">Upload your encrypted datasets (CSV)</h4>
                <FileUpload
                  onFilesSelected={(files) => handleJoinWorkflow(files)}
                  uploadedFiles={state.uploadedDatasets}
                  acceptOnlyCsv={true}
                />

                {state.uploadedDatasets.length > 0 && (
                  <div className="mt-4">
                    <button
                      onClick={() => handleJoinWorkflow([])}
                      disabled={isApproving}
                      className="btn-primary flex items-center space-x-2"
                    >
                      {isApproving ? (
                        <RefreshCwIcon className="w-4 h-4 animate-spin" />
                      ) : (
                        <CheckCircleIcon className="w-4 h-4" />
                      )}
                      <span>Approve & Upload Datasets</span>
                    </button>
                  </div>
                )}
              </div>
            )}

            {!joinWorkflowId && (
              <p className="text-gray-500 text-sm">Enter a Workflow ID to join and upload your data.</p>
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

      {/* Results Display */}
      {state.results.length > 0 && (
        <div className="card">
          <ResultsDisplay results={state.results} />
        </div>
      )}
    </div>
  );
}
