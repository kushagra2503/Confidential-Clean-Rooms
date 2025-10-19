'use client';

import { useCallback, useState } from 'react';
import { useDropzone } from 'react-dropzone';
import { UploadIcon, XIcon, FileIcon, CheckCircleIcon, TrashIcon } from 'lucide-react';
import { validateFileType, formatFileSize } from '@/lib/crypto';
import { UploadedFile } from '@/types';

interface FileUploadProps {
  onFilesSelected: (files: File[]) => void;
  uploadedFiles?: UploadedFile[];
  onRemoveFile?: (fileName: string) => void;
  maxFiles?: number;
  acceptOnlyCsv?: boolean;
}

export function FileUpload({
  onFilesSelected,
  uploadedFiles = [],
  onRemoveFile,
  maxFiles = 10,
  acceptOnlyCsv = true,
}: FileUploadProps) {
  const [error, setError] = useState<string>('');

  const onDrop = useCallback(
    (acceptedFiles: File[], rejectedFiles: { file: File; errors: readonly { message: string }[] }[]) => {
      setError('');

      // Check for rejected files
      if (rejectedFiles.length > 0) {
        const rejectionReasons = rejectedFiles.map((file) => {
          const errors = file.errors.map((error) => error.message).join(', ');
          return `${file.file.name}: ${errors}`;
        });
        setError(`Some files were rejected: ${rejectionReasons.join('; ')}`);
        return;
      }

      // Validate file types if required
      if (acceptOnlyCsv) {
        const invalidFiles = acceptedFiles.filter((file) => !validateFileType(file));
        if (invalidFiles.length > 0) {
          setError(`Only CSV files are allowed: ${invalidFiles.map(f => f.name).join(', ')}`);
          return;
        }
      }

      // Check total file count
      const totalFiles = uploadedFiles.length + acceptedFiles.length;
      if (totalFiles > maxFiles) {
        setError(`Maximum ${maxFiles} files allowed. You tried to upload ${totalFiles} files.`);
        return;
      }

      onFilesSelected(acceptedFiles);
    },
    [onFilesSelected, uploadedFiles.length, maxFiles, acceptOnlyCsv]
  );

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: acceptOnlyCsv ? { 'text/csv': ['.csv'] } : undefined,
    maxFiles: maxFiles - uploadedFiles.length,
    disabled: uploadedFiles.length >= maxFiles,
  });

  const handleRemoveFile = (fileName: string) => {
    if (onRemoveFile) {
      onRemoveFile(fileName);
    }
  };

  return (
    <div className="space-y-4">
      {/* Dropzone */}
      <div
        {...getRootProps()}
        className={`relative border-2 border-dashed rounded-2xl p-12 text-center transition-all duration-300 cursor-pointer group ${
          isDragActive
            ? 'border-blue-500 bg-gradient-to-br from-blue-50 to-indigo-50 shadow-lg scale-105'
            : uploadedFiles.length >= maxFiles
            ? 'border-gray-300 bg-gray-50 cursor-not-allowed'
            : 'border-gray-300 hover:border-blue-400 hover:bg-gradient-to-br hover:from-blue-50 hover:to-indigo-50 hover:shadow-lg hover:scale-102'
        }`}
      >
        <input {...getInputProps()} />
        <div className={`inline-flex items-center justify-center w-20 h-20 rounded-2xl mb-6 transition-all duration-300 ${
          isDragActive ? 'bg-blue-500 scale-110' : 'bg-gradient-to-br from-gray-100 to-gray-200 group-hover:from-blue-100 group-hover:to-indigo-100'
        }`}>
          <UploadIcon className={`w-10 h-10 transition-colors duration-300 ${
            isDragActive ? 'text-white' : 'text-gray-500 group-hover:text-blue-600'
          }`} />
        </div>

        {isDragActive ? (
          <div className="animate-pulse-soft">
            <p className="text-2xl font-bold gradient-text mb-2">
              Drop your CSV files here...
            </p>
            <p className="text-gray-600">Release to upload</p>
          </div>
        ) : uploadedFiles.length >= maxFiles ? (
          <div>
            <p className="text-xl font-semibold text-gray-500 mb-2">
              Maximum files reached
            </p>
            <p className="text-gray-400">You've uploaded the maximum number of files</p>
          </div>
        ) : (
          <div>
            <p className="text-xl font-semibold text-gray-800 mb-3">
              Drag & drop your CSV files here
            </p>
            <p className="text-gray-600 mb-4">
              or click to browse your computer
            </p>
            <div className="flex items-center justify-center space-x-4 text-sm text-gray-500">
              <div className="flex items-center space-x-2">
                <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                <span>CSV files only</span>
              </div>
              <div className="flex items-center space-x-2">
                <div className="w-2 h-2 bg-blue-500 rounded-full"></div>
                <span>Up to {maxFiles} files</span>
              </div>
              {uploadedFiles.length > 0 && (
                <div className="flex items-center space-x-2">
                  <div className="w-2 h-2 bg-emerald-500 rounded-full"></div>
                  <span>{uploadedFiles.length} uploaded</span>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Animated border effect */}
        <div className="absolute inset-0 rounded-2xl bg-gradient-to-r from-blue-500/20 via-indigo-500/20 to-purple-500/20 opacity-0 group-hover:opacity-100 transition-opacity duration-300 -z-10 blur-sm"></div>
      </div>

      {/* Error message */}
      {error && (
        <div className="bg-gradient-to-r from-red-50 to-rose-50 border-2 border-red-200 rounded-xl p-4 animate-pulse-soft">
          <div className="flex items-center space-x-3">
            <div className="bg-red-100 p-2 rounded-lg">
              <XIcon className="w-5 h-5 text-red-600" />
            </div>
            <p className="text-red-700 font-medium">{error}</p>
          </div>
        </div>
      )}

      {/* Uploaded files list */}
      {uploadedFiles.length > 0 && (
        <div className="space-y-4">
          <div className="flex items-center space-x-3">
            <div className="bg-gradient-to-r from-emerald-500 to-green-500 p-2 rounded-lg">
              <CheckCircleIcon className="w-5 h-5 text-white" />
            </div>
            <h4 className="text-lg font-semibold text-gray-800">Uploaded Files</h4>
            <span className="status-badge status-success">{uploadedFiles.length} files ready</span>
          </div>
          <div className="grid gap-3">
            {uploadedFiles.map((file, index) => (
              <div
                key={`${file.name}-${index}`}
                className="bg-gradient-to-r from-emerald-50 to-green-50 border-2 border-emerald-200 rounded-xl p-4 hover:shadow-md transition-all duration-200"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-4">
                    <div className="bg-emerald-100 p-3 rounded-xl">
                      <FileIcon className="w-6 h-6 text-emerald-600" />
                    </div>
                    <div>
                      <p className="font-semibold text-emerald-800 text-lg">{file.name}</p>
                      <p className="text-emerald-600 font-medium">{formatFileSize(file.size)}</p>
                    </div>
                  </div>
                  <div className="flex items-center space-x-2">
                    <div className="bg-emerald-100 px-3 py-1 rounded-full">
                      <CheckCircleIcon className="w-4 h-4 text-emerald-600" />
                    </div>
                    {onRemoveFile && (
                      <button
                        onClick={() => handleRemoveFile(file.name)}
                        className="bg-red-100 hover:bg-red-200 p-2 rounded-lg transition-colors duration-200"
                        title="Remove file"
                      >
                        <TrashIcon className="w-4 h-4 text-red-600" />
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
