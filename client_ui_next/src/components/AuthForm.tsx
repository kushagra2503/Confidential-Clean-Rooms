'use client';

import { useState } from 'react';
import { useAppState, appActions } from '@/hooks/useAppState';
import { UserIcon, UsersIcon } from 'lucide-react';

export function AuthForm() {
  const { state, dispatch } = useAppState();
  const [userId, setUserId] = useState('');
  const [selectedRole, setSelectedRole] = useState<'creator' | 'collaborator' | null>(null);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!userId.trim() || !selectedRole) return;

    dispatch(appActions.setUser(userId.trim(), selectedRole));
  };

  if (state.currentUser && state.currentRole) {
    return (
      <div className="text-center">
        <div className="card max-w-md mx-auto">
          <div className="flex items-center justify-center mb-4">
            {state.currentRole === 'creator' ? (
              <UserIcon className="w-12 h-12 text-blue-600" />
            ) : (
              <UsersIcon className="w-12 h-12 text-green-600" />
            )}
          </div>
          <h2 className="text-xl font-semibold mb-2">
            Welcome, {state.currentUser}!
          </h2>
          <p className="text-gray-600 mb-4">
            You are logged in as a <strong>{state.currentRole}</strong>
          </p>
          <button
            onClick={() => dispatch(appActions.resetState())}
            className="btn-secondary w-full"
          >
            Switch User
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="card max-w-md mx-auto">
      <h1 className="text-2xl font-bold text-center mb-6 text-gray-800">
        YellowSense CCR Demo
      </h1>
      <p className="text-center text-gray-600 mb-6">
        Confidential Clean Rooms for Welfare Fraud Detection
      </p>

      <form onSubmit={handleSubmit} className="space-y-6">
        <div>
          <label htmlFor="userId" className="block text-sm font-medium text-gray-700 mb-2">
            Your ID
          </label>
          <input
            id="userId"
            type="text"
            value={userId}
            onChange={(e) => setUserId(e.target.value)}
            placeholder="Enter your client ID (e.g., Auditor, ClientB)"
            className="input-field"
            required
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-3">
            Select Your Role
          </label>
          <div className="grid grid-cols-2 gap-3">
            <button
              type="button"
              onClick={() => setSelectedRole('creator')}
              className={`p-4 border-2 rounded-lg transition-all duration-200 ${
                selectedRole === 'creator'
                  ? 'border-blue-500 bg-blue-50 text-blue-700'
                  : 'border-gray-200 hover:border-blue-300'
              }`}
            >
              <UserIcon className="w-8 h-8 mx-auto mb-2" />
              <div className="font-medium">Creator</div>
              <div className="text-xs text-gray-500 mt-1">
                Start new workflows
              </div>
            </button>

            <button
              type="button"
              onClick={() => setSelectedRole('collaborator')}
              className={`p-4 border-2 rounded-lg transition-all duration-200 ${
                selectedRole === 'collaborator'
                  ? 'border-green-500 bg-green-50 text-green-700'
                  : 'border-gray-200 hover:border-green-300'
              }`}
            >
              <UsersIcon className="w-8 h-8 mx-auto mb-2" />
              <div className="font-medium">Collaborator</div>
              <div className="text-xs text-gray-500 mt-1">
                Join existing workflows
              </div>
            </button>
          </div>
        </div>

        <button
          type="submit"
          disabled={!userId.trim() || !selectedRole}
          className="btn-primary w-full disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Continue
        </button>
      </form>
    </div>
  );
}
