'use client';

import { RefreshCwIcon, TerminalIcon, CpuIcon, ClockIcon } from 'lucide-react';

interface ExecutionLogsProps {
  logs: string[];
  isPolling?: boolean;
}

export function ExecutionLogs({ logs, isPolling = false }: ExecutionLogsProps) {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-4">
          <div className="bg-gradient-to-r from-purple-500 to-indigo-500 p-3 rounded-xl shadow-lg">
            <TerminalIcon className="w-6 h-6 text-white" />
          </div>
          <div>
            <h3 className="text-2xl font-bold gradient-text">Execution Logs</h3>
            <p className="text-gray-600">Real-time workflow execution monitoring</p>
          </div>
        </div>

        {isPolling && (
          <div className="flex items-center space-x-3 bg-gradient-to-r from-blue-50 to-indigo-50 px-4 py-2 rounded-xl border border-blue-200">
            <div className="flex items-center space-x-2">
              <RefreshCwIcon className="w-4 h-4 text-blue-600 animate-spin" />
              <span className="text-sm font-semibold text-blue-800">Live Execution</span>
            </div>
            <div className="flex items-center space-x-2 text-blue-600">
              <div className="w-2 h-2 bg-blue-500 rounded-full animate-pulse-soft"></div>
              <span className="text-xs">Running</span>
            </div>
          </div>
        )}
      </div>

      <div className="relative">
        <div className="bg-gradient-to-br from-slate-900 via-gray-900 to-slate-900 text-green-400 rounded-2xl p-6 font-mono text-sm max-h-96 overflow-y-auto shadow-2xl border border-slate-700/50">
          {/* Terminal header */}
          <div className="flex items-center justify-between mb-4 pb-3 border-b border-slate-700">
            <div className="flex items-center space-x-2">
              <div className="w-3 h-3 bg-red-500 rounded-full"></div>
              <div className="w-3 h-3 bg-yellow-500 rounded-full"></div>
              <div className="w-3 h-3 bg-green-500 rounded-full"></div>
            </div>
            <div className="text-slate-400 text-xs">Confidential Computing Terminal</div>
          </div>

          {logs.length === 0 ? (
            <div className="text-center py-12">
              <div className="mb-4">
                <CpuIcon className="w-16 h-16 text-slate-600 mx-auto animate-float" />
              </div>
              <p className="text-slate-400 text-lg mb-2">
                {isPolling ? 'Initializing workflow execution...' : 'No logs available'}
              </p>
              <p className="text-slate-500 text-sm">
                {isPolling ? 'Execution will begin shortly' : 'Start a workflow to see logs'}
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {logs.map((log, index) => {
                const isError = log.toLowerCase().includes('error') || log.toLowerCase().includes('failed');
                const isSuccess = log.toLowerCase().includes('success') || log.toLowerCase().includes('completed');
                const isWarning = log.toLowerCase().includes('warning') || log.toLowerCase().includes('warn');

                let textColor = 'text-green-400';
                if (isError) textColor = 'text-red-400';
                else if (isSuccess) textColor = 'text-emerald-400';
                else if (isWarning) textColor = 'text-yellow-400';

                return (
                  <div
                    key={index}
                    className={`whitespace-pre-wrap break-words py-1 px-2 rounded transition-all duration-200 hover:bg-slate-800/50 ${textColor}`}
                  >
                    <span className="text-slate-500 mr-2">$</span>
                    {log}
                  </div>
                );
              })}
              {/* Auto-scroll indicator */}
              {isPolling && (
                <div className="border-t border-slate-700 pt-3 mt-3">
                  <div className="flex items-center space-x-2 text-slate-500">
                    <ClockIcon className="w-4 h-4" />
                    <span className="text-xs">Auto-updating every 2 seconds...</span>
                    <div className="flex space-x-1">
                      <div className="w-1 h-1 bg-blue-500 rounded-full animate-pulse"></div>
                      <div className="w-1 h-1 bg-blue-500 rounded-full animate-pulse" style={{animationDelay: '0.2s'}}></div>
                      <div className="w-1 h-1 bg-blue-500 rounded-full animate-pulse" style={{animationDelay: '0.4s'}}></div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Glow effect */}
        {isPolling && (
          <div className="absolute inset-0 rounded-2xl bg-gradient-to-r from-blue-500/10 via-indigo-500/10 to-purple-500/10 blur-xl -z-10 animate-pulse-soft"></div>
        )}
      </div>

      {isPolling && (
        <div className="bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-200 rounded-xl p-4">
          <div className="flex items-center space-x-3">
            <div className="bg-blue-100 p-2 rounded-lg">
              <ClockIcon className="w-5 h-5 text-blue-600" />
            </div>
            <div>
              <p className="font-semibold text-blue-800">Execution in Progress</p>
              <p className="text-blue-600 text-sm">Logs are updating in real-time. Workflow execution may take several minutes...</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
