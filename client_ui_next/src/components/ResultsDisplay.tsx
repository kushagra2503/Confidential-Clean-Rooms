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
    <div>
      <div className="flex items-center space-x-2 mb-6">
        <BarChartIcon className="w-5 h-5 text-gray-600" />
        <h3 className="text-lg font-semibold">Workflow Results</h3>
      </div>

      <div className="space-y-4">
        {displayResults.map((result) => {
          const fileName = result.result_path.split('/').pop() || 'Unknown File';
          const isExpanded = expandedResults.has(result.result_path);

          return (
            <div key={result.result_path} className="border border-gray-200 rounded-lg overflow-hidden">
              {/* Header */}
              <div
                className="bg-gray-50 px-4 py-3 cursor-pointer hover:bg-gray-100 transition-colors"
                onClick={() => toggleExpanded(result.result_path)}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-3">
                    {isExpanded ? (
                      <ChevronDownIcon className="w-4 h-4 text-gray-500" />
                    ) : (
                      <ChevronRightIcon className="w-4 h-4 text-gray-500" />
                    )}
                    <FileIcon className="w-4 h-4 text-blue-600" />
                    <div>
                      <h4 className="font-medium text-gray-900">{fileName}</h4>
                      <p className="text-sm text-gray-500">
                        Created: {new Date(result.created_at).toLocaleString()}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center space-x-2">
                    {result.download_url && (
                      <a
                        href={result.download_url}
                        download={fileName}
                        className="btn-secondary text-xs px-3 py-1"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <DownloadIcon className="w-3 h-3 mr-1" />
                        Download
                      </a>
                    )}
                  </div>
                </div>
              </div>

              {/* Content */}
              {isExpanded && (
                <div className="p-4 bg-white">
                  {result.error ? (
                    <div className="text-red-600 text-sm bg-red-50 p-3 rounded">
                      Error loading content: {result.error}
                    </div>
                  ) : result.isLoading ? (
                    <div className="text-center py-8">
                      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
                      <p className="text-gray-500 mt-2">Loading content...</p>
                    </div>
                  ) : result.content ? (
                    <div>
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
                    <div className="text-center py-8">
                      <button
                        onClick={() => loadResultContent(result)}
                        className="btn-primary"
                      >
                        Load Content
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
