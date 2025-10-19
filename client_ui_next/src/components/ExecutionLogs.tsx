'use client';

import { RefreshCwIcon, TerminalIcon } from 'lucide-react';

interface ExecutionLogsProps {
  logs: string[];
  isPolling?: boolean;
}

export function ExecutionLogs({ logs, isPolling = false }: ExecutionLogsProps) {
  return (
    <div>
      <div className="flex items-center space-x-2 mb-4">
        <TerminalIcon className="w-5 h-5 text-gray-600" />
        <h3 className="text-lg font-semibold">Execution Logs</h3>
        {isPolling && (
          <div className="flex items-center space-x-1 text-blue-600">
            <RefreshCwIcon className="w-4 h-4 animate-spin" />
            <span className="text-sm">Live</span>
          </div>
        )}
      </div>

      <div className="bg-gray-900 text-green-400 rounded-lg p-4 font-mono text-sm max-h-96 overflow-y-auto">
        {logs.length === 0 ? (
          <div className="text-gray-500 italic">
            {isPolling ? 'Waiting for execution to start...' : 'No logs available'}
          </div>
        ) : (
          <div className="space-y-1">
            {logs.map((log, index) => (
              <div key={index} className="whitespace-pre-wrap break-words">
                {log}
              </div>
            ))}
          </div>
        )}
      </div>

      {isPolling && (
        <p className="text-xs text-gray-500 mt-2">
          Logs are updating in real-time. This may take several minutes...
        </p>
      )}
    </div>
  );
}
