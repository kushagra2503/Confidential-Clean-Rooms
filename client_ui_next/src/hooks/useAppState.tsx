'use client';

import React, { createContext, useContext, useReducer, ReactNode } from 'react';
import { AppState, UploadedFile, WorkflowResult } from '@/types';

// Initial state
const initialState: AppState = {
  currentUser: null,
  currentRole: null,
  currentWorkflowId: null,
  uploadedDatasets: [],
  workflowStatus: null,
  executionLogs: [],
  results: [],
};

// Action types
type AppAction =
  | { type: 'SET_USER'; payload: { user: string; role: 'creator' | 'collaborator' } }
  | { type: 'SET_WORKFLOW_ID'; payload: string }
  | { type: 'ADD_UPLOADED_DATASET'; payload: UploadedFile }
  | { type: 'CLEAR_UPLOADED_DATASETS' }
  | { type: 'SET_WORKFLOW_STATUS'; payload: string }
  | { type: 'ADD_EXECUTION_LOG'; payload: string }
  | { type: 'SET_EXECUTION_LOGS'; payload: string[] }
  | { type: 'CLEAR_EXECUTION_LOGS' }
  | { type: 'SET_RESULTS'; payload: WorkflowResult[] }
  | { type: 'ADD_RESULT'; payload: WorkflowResult }
  | { type: 'CLEAR_RESULTS' }
  | { type: 'RESET_STATE' };

// Reducer
function appReducer(state: AppState, action: AppAction): AppState {
  switch (action.type) {
    case 'SET_USER':
      return {
        ...state,
        currentUser: action.payload.user,
        currentRole: action.payload.role,
      };
    case 'SET_WORKFLOW_ID':
      return {
        ...state,
        currentWorkflowId: action.payload,
      };
    case 'ADD_UPLOADED_DATASET':
      return {
        ...state,
        uploadedDatasets: [...state.uploadedDatasets, action.payload],
      };
    case 'CLEAR_UPLOADED_DATASETS':
      return {
        ...state,
        uploadedDatasets: [],
      };
    case 'SET_WORKFLOW_STATUS':
      return {
        ...state,
        workflowStatus: action.payload,
      };
    case 'ADD_EXECUTION_LOG':
      return {
        ...state,
        executionLogs: [...state.executionLogs, action.payload],
      };
    case 'SET_EXECUTION_LOGS':
      return {
        ...state,
        executionLogs: action.payload,
      };
    case 'CLEAR_EXECUTION_LOGS':
      return {
        ...state,
        executionLogs: [],
      };
    case 'SET_RESULTS':
      return {
        ...state,
        results: action.payload,
      };
    case 'ADD_RESULT':
      return {
        ...state,
        results: [...state.results, action.payload],
      };
    case 'CLEAR_RESULTS':
      return {
        ...state,
        results: [],
      };
    case 'RESET_STATE':
      return initialState;
    default:
      return state;
  }
}

// Context
const AppStateContext = createContext<{
  state: AppState;
  dispatch: React.Dispatch<AppAction>;
} | null>(null);

// Provider component
export function AppStateProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(appReducer, initialState);

  return (
    <AppStateContext.Provider value={{ state, dispatch }}>
      {children}
    </AppStateContext.Provider>
  );
}

// Hook to use the app state
export function useAppState() {
  const context = useContext(AppStateContext);
  if (!context) {
    throw new Error('useAppState must be used within an AppStateProvider');
  }
  return context;
}

// Action creators for convenience
export const appActions = {
  setUser: (user: string, role: 'creator' | 'collaborator') => ({
    type: 'SET_USER' as const,
    payload: { user, role },
  }),

  setWorkflowId: (workflowId: string) => ({
    type: 'SET_WORKFLOW_ID' as const,
    payload: workflowId,
  }),

  addUploadedDataset: (dataset: UploadedFile) => ({
    type: 'ADD_UPLOADED_DATASET' as const,
    payload: dataset,
  }),

  clearUploadedDatasets: () => ({
    type: 'CLEAR_UPLOADED_DATASETS' as const,
  }),

  setWorkflowStatus: (status: string) => ({
    type: 'SET_WORKFLOW_STATUS' as const,
    payload: status,
  }),

  addExecutionLog: (log: string) => ({
    type: 'ADD_EXECUTION_LOG' as const,
    payload: log,
  }),

  setExecutionLogs: (logs: string[]) => ({
    type: 'SET_EXECUTION_LOGS' as const,
    payload: logs,
  }),

  clearExecutionLogs: () => ({
    type: 'CLEAR_EXECUTION_LOGS' as const,
  }),

  setResults: (results: WorkflowResult[]) => ({
    type: 'SET_RESULTS' as const,
    payload: results,
  }),

  addResult: (result: WorkflowResult) => ({
    type: 'ADD_RESULT' as const,
    payload: result,
  }),

  clearResults: () => ({
    type: 'CLEAR_RESULTS' as const,
  }),

  resetState: () => ({
    type: 'RESET_STATE' as const,
  }),
};
