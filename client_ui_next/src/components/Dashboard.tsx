'use client';

import { useState } from 'react';
import { useAppState, appActions } from '@/hooks/useAppState';
import { UserIcon, UsersIcon, LogOutIcon } from 'lucide-react';
import { SoloMode } from './SoloMode';
import { CollaborationMode } from './CollaborationMode';

export function Dashboard() {
  const { state, dispatch } = useAppState();
  const [activeTab, setActiveTab] = useState<'solo' | 'collaboration'>('solo');

  const handleLogout = () => {
    dispatch(appActions.resetState());
  };

  return (
    <div className="max-w-7xl mx-auto">
      {/* Header */}
      <div className="bg-white rounded-xl shadow-lg p-6 mb-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-gray-800">
              YellowSense Confidential Clean Rooms
            </h1>
            <p className="text-gray-600 mt-1">
              Secure collaborative machine learning platform for welfare fraud detection
            </p>
          </div>

          <div className="flex items-center space-x-4">
            <div className="flex items-center space-x-2 bg-blue-50 px-4 py-2 rounded-lg">
              {state.currentRole === 'creator' ? (
                <UserIcon className="w-5 h-5 text-blue-600" />
              ) : (
                <UsersIcon className="w-5 h-5 text-green-600" />
              )}
              <span className="font-medium text-gray-800">
                {state.currentUser} ({state.currentRole})
              </span>
            </div>

            <button
              onClick={handleLogout}
              className="flex items-center space-x-2 btn-secondary"
            >
              <LogOutIcon className="w-4 h-4" />
              <span>Switch User</span>
            </button>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="bg-white rounded-xl shadow-lg overflow-hidden">
        <div className="border-b border-gray-200">
          <nav className="flex">
            <button
              onClick={() => setActiveTab('solo')}
              className={`flex-1 py-4 px-6 text-center font-medium transition-colors duration-200 ${
                activeTab === 'solo'
                  ? 'bg-blue-600 text-white border-b-2 border-blue-600'
                  : 'text-gray-600 hover:bg-gray-50'
              }`}
            >
              <UserIcon className="w-5 h-5 inline mr-2" />
              Solo Mode
            </button>
            <button
              onClick={() => setActiveTab('collaboration')}
              className={`flex-1 py-4 px-6 text-center font-medium transition-colors duration-200 ${
                activeTab === 'collaboration'
                  ? 'bg-blue-600 text-white border-b-2 border-blue-600'
                  : 'text-gray-600 hover:bg-gray-50'
              }`}
            >
              <UsersIcon className="w-5 h-5 inline mr-2" />
              Collaboration Mode
            </button>
          </nav>
        </div>

        <div className="p-6">
          {activeTab === 'solo' ? <SoloMode /> : <CollaborationMode />}
        </div>
      </div>
    </div>
  );
}
