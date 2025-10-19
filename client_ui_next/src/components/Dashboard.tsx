'use client';

import { useState } from 'react';
import { useAppState, appActions } from '@/hooks/useAppState';
import { UserIcon, UsersIcon, LogOutIcon, ShieldIcon, DatabaseIcon } from 'lucide-react';
import { SoloMode } from './SoloMode';
import { CollaborationMode } from './CollaborationMode';

export function Dashboard() {
  const { state, dispatch } = useAppState();
  const [activeTab, setActiveTab] = useState<'solo' | 'collaboration'>('solo');

  const handleLogout = () => {
    dispatch(appActions.resetState());
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50">
      <div className="max-w-7xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="glass-card rounded-3xl p-8 mb-8 animate-float">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-4">
              <div className="bg-gradient-to-r from-blue-600 to-indigo-600 p-4 rounded-2xl shadow-lg">
                <ShieldIcon className="w-8 h-8 text-white" />
              </div>
              <div>
                <h1 className="text-4xl font-bold gradient-text mb-2">
                  YellowSense CCR
                </h1>
                <p className="text-gray-600 text-lg">
                  Secure collaborative machine learning platform for welfare fraud detection
                </p>
                <div className="flex items-center space-x-2 mt-3">
                  <DatabaseIcon className="w-5 h-5 text-blue-600" />
                  <span className="text-sm text-gray-500">Confidential Computing Environment</span>
                </div>
              </div>
            </div>

            <div className="flex items-center space-x-4">
              <div className="flex items-center space-x-3 glass-card px-6 py-3 rounded-xl">
                <div className="bg-gradient-to-r from-emerald-500 to-green-500 p-2 rounded-lg">
                  <UserIcon className="w-5 h-5 text-white" />
                </div>
                <div>
                  <p className="text-sm text-gray-500">Current User</p>
                  <p className="font-semibold text-gray-800">{state.currentUser}</p>
                </div>
              </div>

              <button
                onClick={handleLogout}
                className="flex items-center space-x-2 btn-secondary text-sm"
              >
                <LogOutIcon className="w-4 h-4" />
                <span>Switch User</span>
              </button>
            </div>
          </div>
        </div>

        {/* Tabs */}
        <div className="bg-white rounded-3xl shadow-xl overflow-hidden mb-8">
          <div className="border-b border-gray-200">
            <nav className="flex">
              <button
                onClick={() => setActiveTab('solo')}
                className={`flex-1 py-4 px-6 text-center font-semibold transition-all duration-200 ${
                  activeTab === 'solo'
                    ? 'bg-gradient-to-r from-blue-600 to-indigo-600 text-white border-b-4 border-blue-600'
                    : 'text-gray-600 hover:bg-gray-50 hover:text-blue-600'
                }`}
              >
                <UserIcon className="w-5 h-5 inline mr-3" />
                Solo Mode
              </button>
              <button
                onClick={() => setActiveTab('collaboration')}
                className={`flex-1 py-4 px-6 text-center font-semibold transition-all duration-200 ${
                  activeTab === 'collaboration'
                    ? 'bg-gradient-to-r from-blue-600 to-indigo-600 text-white border-b-4 border-blue-600'
                    : 'text-gray-600 hover:bg-gray-50 hover:text-blue-600'
                }`}
              >
                <UsersIcon className="w-5 h-5 inline mr-3" />
                Collaboration Mode
              </button>
            </nav>
          </div>

          <div className="p-8">
            {activeTab === 'solo' ? <SoloMode /> : <CollaborationMode />}
          </div>
        </div>
      </div>
    </div>
  );
}
