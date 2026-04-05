import { useState, useEffect, useRef } from 'react';
import { X, ChevronLeft, ChevronRight, FileText } from 'lucide-react';

export default function PdfViewer({ files, onClose }) {
  const [selectedIdx, setSelectedIdx] = useState(0);
  const [objectUrl, setObjectUrl] = useState(null);
  const prevUrl = useRef(null);

  // Revoke previous object URL to avoid memory leaks
  useEffect(() => {
    if (!files?.length) return;
    const file = files[selectedIdx];
    if (!file) return;

    const url = URL.createObjectURL(file);
    setObjectUrl(url);
    prevUrl.current = url;

    return () => URL.revokeObjectURL(url);
  }, [files, selectedIdx]);

  if (!files?.length) return null;

  const total = files.length;
  const current = files[selectedIdx];

  return (
    <div className="flex flex-col h-full bg-gray-50 border-l border-gray-200">

      {/* ── Toolbar ── */}
      <div className="flex items-center gap-2 px-4 py-2.5 bg-white border-b border-gray-200 flex-shrink-0">
        <FileText size={14} className="text-gray-400 flex-shrink-0" />

        {/* File name / selector */}
        <div className="flex-1 min-w-0">
          {total === 1 ? (
            <p className="text-xs font-medium text-gray-700 truncate" title={current?.name}>
              {current?.name}
            </p>
          ) : (
            <select
              value={selectedIdx}
              onChange={(e) => setSelectedIdx(Number(e.target.value))}
              className="w-full text-xs border border-gray-200 rounded-md px-2 py-1 bg-white text-gray-700 focus:outline-none focus:ring-1 focus:ring-[#1B2A4A]/30"
            >
              {files.map((f, i) => (
                <option key={i} value={i}>
                  {f.name}
                </option>
              ))}
            </select>
          )}
        </div>

        {/* Prev / Next when multiple files */}
        {total > 1 && (
          <div className="flex items-center gap-1 flex-shrink-0">
            <button
              onClick={() => setSelectedIdx((i) => Math.max(0, i - 1))}
              disabled={selectedIdx === 0}
              className="w-6 h-6 rounded flex items-center justify-center text-gray-400 hover:text-gray-600 hover:bg-gray-100 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            >
              <ChevronLeft size={13} />
            </button>
            <span className="text-xs text-gray-400 tabular-nums">{selectedIdx + 1}/{total}</span>
            <button
              onClick={() => setSelectedIdx((i) => Math.min(total - 1, i + 1))}
              disabled={selectedIdx === total - 1}
              className="w-6 h-6 rounded flex items-center justify-center text-gray-400 hover:text-gray-600 hover:bg-gray-100 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            >
              <ChevronRight size={13} />
            </button>
          </div>
        )}

        {/* Close */}
        <button
          onClick={onClose}
          className="w-6 h-6 rounded flex items-center justify-center text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors flex-shrink-0"
          title="Close PDF viewer"
        >
          <X size={13} />
        </button>
      </div>

      {/* ── PDF iframe ── */}
      <div className="flex-1 overflow-hidden">
        {objectUrl ? (
          <iframe
            key={objectUrl}
            src={objectUrl}
            title={current?.name || 'PDF'}
            className="w-full h-full border-none"
          />
        ) : (
          <div className="flex items-center justify-center h-full text-gray-400 text-sm">
            Loading…
          </div>
        )}
      </div>
    </div>
  );
}
