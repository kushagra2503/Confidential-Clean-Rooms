'use client';

import { useState, useEffect } from 'react';
import { WorkflowResult } from '@/types';
import {
  DownloadIcon,
  FileIcon,
  BarChartIcon,
  ChevronDownIcon,
  ChevronRightIcon
} from 'lucide-react';

interface ResultsDisplayProps {
  results: WorkflowResult[];
}

interface DisplayResult extends WorkflowResult {
  content?: unknown;
  isLoading: boolean;
  error?: string;
}

export function ResultsDisplay({ results }: ResultsDisplayProps) {
  const [displayResults, setDisplayResults] = useState<DisplayResult[]>([]);
  const [expandedResults, setExpandedResults] = useState<Set<string>>(new Set());

  useEffect(() => {
    // Initialize display results
    const initialResults = results.map(result => ({
      ...result,
      isLoading: false,
      error: undefined,
    }));
    setDisplayResults(initialResults);
  }, [results]);

  const toggleExpanded = (resultPath: string) => {
    const newExpanded = new Set(expandedResults);
    if (newExpanded.has(resultPath)) {
      newExpanded.delete(resultPath);
    } else {
      newExpanded.add(resultPath);
    }
    setExpandedResults(newExpanded);
  };

  const loadResultContent = async (result: DisplayResult) => {
    if (result.content || result.isLoading) return;

    setDisplayResults(prev =>
      prev.map(r =>
        r.result_path === result.result_path
          ? { ...r, isLoading: true, error: undefined }
          : r
      )
    );

    try {
      if (!result.download_url) {
        throw new Error('No download URL available');
      }

      const response = await fetch(result.download_url);
      if (!response.ok) {
        throw new Error(`Failed to fetch: ${response.statusText}`);
      }

      const contentType = response.headers.get('content-type') || '';
      const fileName = result.result_path.split('/').pop() || '';

      if (contentType.includes('application/json')) {
        const data = await response.json();
        setDisplayResults(prev =>
          prev.map(r =>
            r.result_path === result.result_path
              ? { ...r, content: data, isLoading: false }
              : r
          )
        );
      } else if (fileName.endsWith('.csv')) {
        const text = await response.text();
        // Parse CSV (simple implementation)
        const lines = text.split('\n').filter(line => line.trim());
        const headers = lines[0]?.split(',') || [];
        const rows = lines.slice(1).map(line => line.split(','));

        setDisplayResults(prev =>
          prev.map(r =>
            r.result_path === result.result_path
              ? { ...r, content: { headers, rows }, isLoading: false }
              : r
          )
        );
      } else {
        const text = await response.text();
        setDisplayResults(prev =>
          prev.map(r =>
            r.result_path === result.result_path
              ? { ...r, content: text, isLoading: false }
              : r
          )
        );
      }
    } catch (error) {
      console.error('Failed to load result content:', error);
      setDisplayResults(prev =>
        prev.map(r =>
          r.result_path === result.result_path
            ? {
                ...r,
                isLoading: false,
                error: error instanceof Error ? error.message : 'Failed to load content'
              }
            : r
        )
      );
    }
  };

  const renderMetrics = (data: Record<string, unknown>) => {
    if (typeof data !== 'object' || !data) return null;

    const metrics = Object.entries(data).filter(([_, value]) =>
      typeof value === 'number'
    );

    if (metrics.length === 0) return null;

    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
        {metrics.map(([key, value]) => (
          <div key={key} className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <div className="text-sm text-blue-600 font-medium mb-1">
              {key.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}
            </div>
            <div className="text-2xl font-bold text-blue-800">
              {typeof value === 'number' ? value.toFixed(4) : String(value)}
            </div>
          </div>
        ))}
      </div>
    );
  };

  const renderCSVTable = (content: { headers: string[]; rows: string[][] }) => {
    if (!content || !content.headers || !content.rows) return null;

    return (
      <div className="overflow-x-auto">
        <table className="min-w-full bg-white border border-gray-300">
          <thead className="bg-gray-50">
            <tr>
              {content.headers.map((header, index) => (
                <th key={index} className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider border-b">
                  {header.trim()}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {content.rows.slice(0, 100).map((row, rowIndex) => (
              <tr key={rowIndex} className="hover:bg-gray-50">
                {row.map((cell, cellIndex) => (
                  <td key={cellIndex} className="px-4 py-2 text-sm text-gray-900 border-b">
                    {cell?.trim() || ''}
                  </td>
                ))}
              </tr>
            ))}
            {content.rows.length > 100 && (
              <tr>
                <td colSpan={content.headers.length} className="px-4 py-2 text-center text-gray-500 text-sm">
                  ... and {content.rows.length - 100} more rows
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    );
  };

  const renderJSON = (data: Record<string, unknown>) => {
    if (typeof data !== 'object') return null;

    return (
      <pre className="bg-gray-100 p-4 rounded-lg overflow-x-auto text-sm">
        {JSON.stringify(data, null, 2)}
      </pre>
    );
  };

  const renderTextContent = (content: string) => {
    return (
      <pre className="bg-gray-100 p-4 rounded-lg overflow-x-auto text-sm whitespace-pre-wrap">
        {content}
      </pre>
    );
  };

  if (results.length === 0) {
    return (
      <div className="text-center py-8 text-gray-500">
        No results available
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div className="flex items-center space-x-4">
        <div className="bg-gradient-to-r from-emerald-500 to-green-500 p-3 rounded-xl shadow-lg">
          <BarChartIcon className="w-6 h-6 text-white" />
        </div>
        <div>
          <h3 className="text-2xl font-bold gradient-text">Workflow Results</h3>
          <p className="text-gray-600">Analysis outputs and generated insights</p>
        </div>
      </div>

      <div className="space-y-6">
        {displayResults.map((result) => {
          const fileName = result.result_path.split('/').pop() || 'Unknown File';
          const isExpanded = expandedResults.has(result.result_path);
          const fileExtension = fileName.split('.').pop()?.toLowerCase();

          // Determine file type icon and color
          const getFileTypeInfo = (extension: string) => {
            switch (extension) {
              case 'json':
                return { icon: '📊', color: 'from-blue-500 to-indigo-500', label: 'Metrics' };
              case 'csv':
                return { icon: '📋', color: 'from-emerald-500 to-green-500', label: 'Dataset' };
              default:
                return { icon: '📄', color: 'from-slate-500 to-gray-500', label: 'File' };
            }
          };

          const fileTypeInfo = getFileTypeInfo(fileExtension || '');

          return (
            <div key={result.result_path} className="card-subtle overflow-hidden hover:shadow-xl transition-all duration-300">
              {/* Header */}
              <div
                className="px-6 py-4 cursor-pointer hover:bg-white/50 transition-all duration-200"
                onClick={() => toggleExpanded(result.result_path)}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-4">
                    <div className={`bg-gradient-to-r ${fileTypeInfo.color} p-3 rounded-xl shadow-md`}>
                      <span className="text-2xl">{fileTypeInfo.icon}</span>
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center space-x-3 mb-1">
                        <h4 className="font-bold text-gray-800 text-lg">{fileName}</h4>
                        <span className="status-badge status-info text-xs">{fileTypeInfo.label}</span>
                      </div>
                      <p className="text-gray-600 text-sm">
                        Generated {new Date(result.created_at).toLocaleString()}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center space-x-3">
                    {result.download_url && (
                      <a
                        href={result.download_url}
                        download={fileName}
                        className="btn-secondary text-sm px-4 py-2"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <DownloadIcon className="w-4 h-4 mr-2" />
                        Download
                      </a>
                    )}
                    <div className="text-gray-400">
                      {isExpanded ? (
                        <ChevronDownIcon className="w-5 h-5" />
                      ) : (
                        <ChevronRightIcon className="w-5 h-5" />
                      )}
                    </div>
                  </div>
                </div>
              </div>

              {/* Content */}
              {isExpanded && (
                <div className="px-6 py-6 bg-gradient-to-r from-slate-50 to-blue-50 border-t border-white/20">
                  {result.error ? (
                    <div className="bg-gradient-to-r from-red-50 to-rose-50 border-2 border-red-200 rounded-xl p-4">
                      <div className="flex items-center space-x-3">
                        <div className="bg-red-100 p-2 rounded-lg">
                          <span className="text-red-600 text-lg">⚠️</span>
                        </div>
                        <div>
                          <p className="font-semibold text-red-800">Error Loading Content</p>
                          <p className="text-red-600 text-sm">{result.error}</p>
                        </div>
                      </div>
                    </div>
                  ) : result.isLoading ? (
                    <div className="text-center py-12">
                      <div className="mb-4">
                        <div className="animate-spin rounded-full h-12 w-12 border-4 border-blue-200 border-t-blue-600 mx-auto"></div>
                      </div>
                      <p className="text-gray-600 font-medium">Loading file content...</p>
                      <p className="text-gray-500 text-sm mt-1">Fetching data from secure storage</p>
                    </div>
                  ) : result.content ? (
                    <div className="space-y-6">
                      {/* Render metrics for JSON with numeric values */}
                      {fileName.endsWith('.json') && result.content && typeof result.content === 'object' && renderMetrics(result.content as Record<string, unknown>)}

                      {/* Render CSV table */}
                      {fileName.endsWith('.csv') && result.content && typeof result.content === 'object' && renderCSVTable(result.content as { headers: string[]; rows: string[][] })}

                      {/* Render JSON object */}
                      {fileName.endsWith('.json') && result.content && typeof result.content === 'object' && renderJSON(result.content as Record<string, unknown>)}

                      {/* Render text content */}
                      {typeof result.content === 'string' && renderTextContent(result.content)}
                    </div>
                  ) : (
                    <div className="text-center py-12">
                      <div className="mb-6">
                        <div className="bg-gradient-to-r from-blue-100 to-indigo-100 p-4 rounded-2xl inline-block">
                          <FileIcon className="w-12 h-12 text-blue-600 animate-float" />
                        </div>
                        <h4 className="text-lg font-semibold text-gray-800 mt-4 mb-2">Content Not Loaded</h4>
                        <p className="text-gray-600">Click to load and preview this file</p>
                      </div>
                      <button
                        onClick={() => loadResultContent(result)}
                        className="btn-primary px-8 py-3 text-lg"
                      >
                        📂 Load File Content
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
