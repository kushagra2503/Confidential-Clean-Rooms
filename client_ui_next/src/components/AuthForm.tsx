'use client';

import { useState } from 'react';
import { useAppState, appActions } from '@/hooks/useAppState';
import { UserIcon, UsersIcon, ShieldIcon, ArrowRightIcon } from 'lucide-react';

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
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50 flex items-center justify-center p-4">
        <div className="glass-card max-w-lg w-full text-center p-8">
          <div className="mb-6">
            <div className="bg-gradient-to-r from-emerald-500 to-green-500 p-4 rounded-2xl inline-block mb-6">
              <ShieldIcon className="w-12 h-12 text-white" />
            </div>
            <h2 className="text-3xl font-bold gradient-text mb-2">
              Welcome back, {state.currentUser}!
            </h2>
            <p className="text-gray-600">Ready to run secure machine learning workflows</p>
          </div>

          <div className="space-y-4">
            <div className="bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-200 rounded-xl p-4">
              <div className="flex items-center justify-center space-x-3">
                <div className="bg-blue-100 p-2 rounded-lg">
                  <UserIcon className="w-5 h-5 text-blue-600" />
                </div>
                <div className="text-left">
                  <p className="text-sm text-gray-500">Current Session</p>
                  <p className="font-semibold text-gray-800">{state.currentUser}</p>
                  <p className="text-sm text-gray-500 capitalize">{state.currentRole}</p>
                </div>
              </div>
            </div>

            <button
              onClick={() => dispatch(appActions.resetState())}
              className="btn-secondary w-full flex items-center justify-center space-x-2"
            >
              <UserIcon className="w-4 h-4" />
              <span>Switch User</span>
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50 flex items-center justify-center p-4">
      <div className="glass-card max-w-lg w-full">
        <div className="text-center mb-8">
          <div className="bg-gradient-to-r from-blue-600 to-indigo-600 p-4 rounded-2xl inline-block mb-6">
            <ShieldIcon className="w-12 h-12 text-white" />
          </div>
          <h1 className="text-3xl font-bold gradient-text mb-2">
            YellowSense CCR
          </h1>
          <p className="text-gray-600">
            Confidential Clean Rooms for Secure ML Workflows
          </p>
          <p className="text-sm text-gray-500 mt-2">
            Welfare Fraud Detection Platform
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div>
            <label htmlFor="userId" className="block text-sm font-semibold text-gray-700 mb-3">
              Enter Your Client ID
            </label>
            <div className="relative">
              <UserIcon className="absolute left-4 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
              <input
                id="userId"
                type="text"
                value={userId}
                onChange={(e) => setUserId(e.target.value)}
                placeholder="e.g., Auditor, ClientB"
                className="input-field pl-12"
                required
              />
            </div>
            <p className="text-xs text-gray-500 mt-2">
              This will be used to identify your workflows and datasets
            </p>
          </div>

          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-3">
              Select Your Role
            </label>
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setSelectedRole('creator')}
                className={`p-4 border-2 rounded-xl transition-all duration-200 ${
                  selectedRole === 'creator'
                    ? 'border-blue-500 bg-blue-50 text-blue-700'
                    : 'border-gray-200 hover:border-blue-300'
                }`}
              >
                <UserIcon className="w-8 h-8 mx-auto mb-2" />
                <div className="font-medium">Creator</div>
                <div className="text-xs text-gray-500 mt-1">
                  Start workflows
                </div>
              </button>

              <button
                type="button"
                onClick={() => setSelectedRole('collaborator')}
                className={`p-4 border-2 rounded-xl transition-all duration-200 ${
                  selectedRole === 'collaborator'
                    ? 'border-green-500 bg-green-50 text-green-700'
                    : 'border-gray-200 hover:border-green-300'
                }`}
              >
                <UsersIcon className="w-8 h-8 mx-auto mb-2" />
                <div className="font-medium">Collaborator</div>
                <div className="text-xs text-gray-500 mt-1">
                  Join workflows
                </div>
              </button>
            </div>
          </div>

          <button
            type="submit"
            disabled={!userId.trim() || !selectedRole}
            className="btn-primary w-full flex items-center justify-center space-x-2 py-4 text-lg disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <span>Start Secure Session</span>
            <ArrowRightIcon className="w-5 h-5" />
          </button>
        </form>

        <div className="mt-8 pt-6 border-t border-gray-200">
          <div className="grid grid-cols-3 gap-4 text-center">
            <div className="flex flex-col items-center">
              <div className="bg-blue-100 p-2 rounded-lg mb-2">
                <ShieldIcon className="w-5 h-5 text-blue-600" />
              </div>
              <span className="text-xs text-gray-600">Secure</span>
            </div>
            <div className="flex flex-col items-center">
              <div className="bg-emerald-100 p-2 rounded-lg mb-2">
                <UserIcon className="w-5 h-5 text-emerald-600" />
              </div>
              <span className="text-xs text-gray-600">Private</span>
            </div>
            <div className="flex flex-col items-center">
              <div className="bg-purple-100 p-2 rounded-lg mb-2">
                <span className="text-purple-600 font-bold text-sm">ML</span>
              </div>
              <span className="text-xs text-gray-600">Powered</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
