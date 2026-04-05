import React, { useRef, useState, useCallback } from 'react';
import { FileText, UploadCloud, X, CheckCircle, Loader2 } from 'lucide-react';

function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function UploadZone({ files, onFilesChange, phase, onUpload, onRun }) {
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef(null);

  const addFiles = useCallback(
    (incoming) => {
      const pdfs = Array.from(incoming).filter(
        (f) => f.type === 'application/pdf' || f.name.toLowerCase().endsWith('.pdf')
      );
      if (!pdfs.length) return;
      // Deduplicate by name
      const existing = new Set(files.map((f) => f.name));
      const newFiles = pdfs.filter((f) => !existing.has(f.name));
      onFilesChange([...files, ...newFiles]);
    },
    [files, onFilesChange]
  );

  function handleDrop(e) {
    e.preventDefault();
    setDragging(false);
    addFiles(e.dataTransfer.files);
  }

  function handleDragOver(e) {
    e.preventDefault();
    setDragging(true);
  }

  function handleDragLeave(e) {
    if (!e.currentTarget.contains(e.relatedTarget)) {
      setDragging(false);
    }
  }

  function handleInputChange(e) {
    addFiles(e.target.files);
    e.target.value = '';
  }

  function removeFile(index) {
    onFilesChange(files.filter((_, i) => i !== index));
  }

  const isUploading = phase === 'uploading';
  const isUploaded = phase === 'uploaded';
  const isRunning = phase === 'running';
  const isLocked = isUploading || isRunning;

  return (
    <div className="space-y-4">
      {/* Drop zone */}
      {(phase === 'idle' || phase === 'error') && (
        <div
          onDrop={handleDrop}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onClick={() => !isLocked && inputRef.current?.click()}
          className={`relative rounded-xl border-2 border-dashed transition-all duration-200 cursor-pointer select-none
            ${dragging
              ? 'border-blue-400 bg-blue-50'
              : 'border-gray-200 bg-gray-50 hover:border-[#1B2A4A]/40 hover:bg-[#1B2A4A]/[0.02]'
            }
            ${isLocked ? 'pointer-events-none opacity-60' : ''}
          `}
          style={{ minHeight: 180 }}
        >
          <input
            ref={inputRef}
            type="file"
            multiple
            accept=".pdf,application/pdf"
            className="hidden"
            onChange={handleInputChange}
          />
          <div className="flex flex-col items-center justify-center h-full py-12 px-6 text-center">
            <div
              className={`w-14 h-14 rounded-2xl flex items-center justify-center mb-4 transition-colors ${
                dragging ? 'bg-blue-100' : 'bg-white shadow-card'
              }`}
            >
              <UploadCloud
                size={24}
                className={dragging ? 'text-blue-500' : 'text-[#1B2A4A]'}
              />
            </div>
            <p className="text-gray-700 font-medium text-sm mb-1">
              {dragging ? 'Release to add files' : 'Drop PDFs here or click to browse'}
            </p>
            <p className="text-gray-400 text-xs">
              Supports PDF files only — multiple files allowed
            </p>
          </div>
        </div>
      )}

      {/* Uploading spinner */}
      {isUploading && (
        <div className="rounded-xl border border-blue-100 bg-blue-50 p-8 flex flex-col items-center justify-center gap-3">
          <Loader2 size={28} className="text-blue-500 animate-spin" />
          <div className="text-center">
            <p className="text-blue-700 font-medium text-sm">Uploading files…</p>
            <p className="text-blue-500/70 text-xs mt-0.5">
              Converting PDFs to markdown via LlamaParse
            </p>
          </div>
        </div>
      )}

      {/* Running pipeline spinner */}
      {isRunning && (
        <div className="rounded-xl border border-amber-100 bg-amber-50 p-8 flex flex-col items-center justify-center gap-3">
          <Loader2 size={28} className="text-amber-500 animate-spin" />
          <div className="text-center">
            <p className="text-amber-700 font-medium text-sm">Running pipeline…</p>
            <p className="text-amber-600/70 text-xs mt-0.5">
              Extracting evidence and performing quality appraisal — this may take a few minutes
            </p>
          </div>
        </div>
      )}

      {/* File list */}
      {files.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-medium text-gray-500 uppercase tracking-wider px-0.5">
            {files.length} file{files.length !== 1 ? 's' : ''} selected
          </p>
          <div className="space-y-1.5">
            {files.map((file, index) => (
              <div
                key={`${file.name}-${index}`}
                className="flex items-center gap-3 p-3 bg-white rounded-lg border border-gray-100 shadow-card group"
              >
                <div className="flex-shrink-0 w-8 h-8 rounded-lg bg-[#1B2A4A]/5 flex items-center justify-center">
                  <FileText size={14} className="text-[#1B2A4A]" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-800 truncate">{file.name}</p>
                  <p className="text-xs text-gray-400">{formatBytes(file.size)}</p>
                </div>
                {isUploaded ? (
                  <CheckCircle size={16} className="text-green-500 flex-shrink-0" />
                ) : !isLocked ? (
                  <button
                    onClick={(e) => { e.stopPropagation(); removeFile(index); }}
                    className="flex-shrink-0 w-6 h-6 rounded-md flex items-center justify-center text-gray-300 hover:text-gray-500 hover:bg-gray-100 transition-colors opacity-0 group-hover:opacity-100"
                    aria-label={`Remove ${file.name}`}
                  >
                    <X size={13} />
                  </button>
                ) : null}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Action buttons */}
      <div className="flex items-center gap-3 pt-2">
        {(phase === 'idle' || phase === 'error') && (
          <button
            onClick={onUpload}
            disabled={files.length === 0}
            className="btn-primary"
          >
            <UploadCloud size={15} />
            Upload {files.length > 0 ? `${files.length} file${files.length !== 1 ? 's' : ''}` : 'Files'}
          </button>
        )}

        {isUploaded && (
          <>
            <button onClick={onRun} className="btn-primary">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="15"
                height="15"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <polygon points="5 3 19 12 5 21 5 3" />
              </svg>
              Extract &amp; Appraise
            </button>
            <button
              onClick={() => inputRef.current?.click()}
              className="btn-secondary"
            >
              Add More Files
            </button>
            <input
              ref={inputRef}
              type="file"
              multiple
              accept=".pdf,application/pdf"
              className="hidden"
              onChange={handleInputChange}
            />
          </>
        )}
      </div>
    </div>
  );
}
