'use client';

import { useCallback, useState } from 'react';
import { useDropzone } from 'react-dropzone';
import { UploadIcon, XIcon, FileIcon, CheckCircleIcon } from 'lucide-react';
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
        className={`border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors duration-200 ${
          isDragActive
            ? 'border-blue-500 bg-blue-50'
            : uploadedFiles.length >= maxFiles
            ? 'border-gray-300 bg-gray-50 cursor-not-allowed'
            : 'border-gray-300 hover:border-blue-400 hover:bg-blue-50'
        }`}
      >
        <input {...getInputProps()} />
        <UploadIcon className="w-12 h-12 mx-auto mb-4 text-gray-400" />
        {isDragActive ? (
          <p className="text-lg font-medium text-blue-600">
            Drop your CSV files here...
          </p>
        ) : uploadedFiles.length >= maxFiles ? (
          <p className="text-lg font-medium text-gray-500">
            Maximum files reached
          </p>
        ) : (
          <div>
            <p className="text-lg font-medium text-gray-700 mb-2">
              Drag & drop CSV files here, or click to select
            </p>
            <p className="text-sm text-gray-500">
              {uploadedFiles.length > 0
                ? `${uploadedFiles.length} of ${maxFiles} files uploaded`
                : `Upload up to ${maxFiles} CSV files`
              }
            </p>
          </div>
        )}
      </div>

      {/* Error message */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <p className="text-red-700 text-sm">{error}</p>
        </div>
      )}

      {/* Uploaded files list */}
      {uploadedFiles.length > 0 && (
        <div className="space-y-2">
          <h4 className="font-medium text-gray-700">Uploaded Files:</h4>
          <div className="space-y-2">
            {uploadedFiles.map((file, index) => (
              <div
                key={`${file.name}-${index}`}
                className="flex items-center justify-between bg-green-50 border border-green-200 rounded-lg p-3"
              >
                <div className="flex items-center space-x-3">
                  <CheckCircleIcon className="w-5 h-5 text-green-600" />
                  <FileIcon className="w-5 h-5 text-gray-500" />
                  <div>
                    <p className="font-medium text-gray-800">{file.name}</p>
                    <p className="text-sm text-gray-500">{formatFileSize(file.size)}</p>
                  </div>
                </div>
                {onRemoveFile && (
                  <button
                    onClick={() => handleRemoveFile(file.name)}
                    className="text-red-500 hover:text-red-700 p-1"
                    title="Remove file"
                  >
                    <XIcon className="w-4 h-4" />
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
