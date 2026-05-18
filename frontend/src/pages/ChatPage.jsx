import { useState, useCallback, useEffect, useRef } from 'react';
import { FileText, X } from 'lucide-react';
import ChatWithDoc from '../components/ChatWithDoc.jsx';

// Module-level cache survives component unmount/remount within the same browser session.
const pdfCache = new Map(); // docId → { url, fileName }
function cachePdf(docId, file) {
  if (pdfCache.has(docId)) URL.revokeObjectURL(pdfCache.get(docId).url);
  const url = URL.createObjectURL(file);
  pdfCache.set(docId, { url, fileName: file.name });
  return url;
}


export default function ChatPage({ sidebarOpen }) {
  const [pdfFile, setPdfFile]         = useState(null);   // File object from just-indexed upload
  const [pdfUrl, setPdfUrl]           = useState(null);   // blob URL derived from pdfFile
  const [showPdf, setShowPdf]         = useState(false);
  const [pdfWidthPct, setPdfWidthPct] = useState(40);

  const mainRef    = useRef(null);
  const isDragging = useRef(false);
  const dragStartX = useRef(0);
  const dragStartPct = useRef(40);

  // No per-render URL management needed — cache handles creation; cleanup on page unload only.

  // Called after a new file is successfully indexed — cache + show PDF
  const handleFileIndexed = useCallback((file, docId) => {
    if (!file || !docId) return;
    const url = cachePdf(docId, file);
    setPdfFile(file);
    setPdfUrl(url);
    setShowPdf(true);
  }, []);

  // Called when the user picks an existing doc from the dropdown
  const handleDocSelected = useCallback((doc) => {
    const cached = pdfCache.get(doc.doc_id);
    if (cached) {
      setPdfUrl(cached.url);
      setShowPdf(true);
    } else {
      setPdfUrl(null);
      setPdfFile(null);
      setShowPdf(false);
    }
  }, []);

  // Resizable divider
  const handleDividerMouseDown = useCallback((e) => {
    e.preventDefault();
    isDragging.current = true;
    dragStartX.current = e.clientX;
    dragStartPct.current = pdfWidthPct;
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  }, [pdfWidthPct]);

  useEffect(() => {
    function onMouseMove(e) {
      if (!isDragging.current || !mainRef.current) return;
      const w = mainRef.current.getBoundingClientRect().width;
      const delta = ((e.clientX - dragStartX.current) / w) * 100;
      setPdfWidthPct(Math.min(60, Math.max(25, dragStartPct.current - delta)));
    }
    function onMouseUp() {
      if (!isDragging.current) return;
      isDragging.current = false;
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    }
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
    return () => {
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
    };
  }, []);

  const marginLeft = sidebarOpen ? 260 : 48;

  return (
    <main
      ref={mainRef}
      className="flex-1 flex overflow-hidden h-screen"
      style={{ marginLeft }}
    >
      {/* ── Chat Panel (left) ── */}
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-3xl mx-auto px-8 py-10">
          <div className="mb-8">
            <h1 className="text-2xl font-bold text-gray-900 tracking-tight">Chat with Your Document</h1>
            <p className="text-sm text-gray-500 mt-1">
              Upload a PDF and ask questions about its content.
            </p>
          </div>
          <ChatWithDoc
            onFileIndexed={handleFileIndexed}
            onDocSelected={handleDocSelected}
            pdfUrl={pdfUrl}
            showPdf={showPdf}
            onTogglePdf={() => setShowPdf((v) => !v)}
          />
        </div>
      </div>

      {/* ── Resizable divider + PDF Panel (right) ── */}
      {showPdf && pdfUrl && (
        <>
          <div
            onMouseDown={handleDividerMouseDown}
            className="flex-shrink-0 w-1.5 cursor-col-resize hover:bg-[#1B2A4A]/20 active:bg-[#1B2A4A]/40 transition-colors relative group"
            style={{ background: '#E2E8F0' }}
            title="Drag to resize"
          >
            <div className="absolute inset-y-0 left-1/2 -translate-x-1/2 flex flex-col items-center justify-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
              {[0, 1, 2].map((i) => (
                <span key={i} className="w-1 h-1 rounded-full bg-gray-400" />
              ))}
            </div>
          </div>

          <div
            className="flex-shrink-0 flex flex-col bg-gray-50 border-l border-gray-200"
            style={{ width: `${pdfWidthPct}%` }}
          >
            {/* PDF toolbar */}
            <div className="flex items-center gap-2 px-4 py-2.5 bg-white border-b border-gray-200 flex-shrink-0">
              <FileText size={14} className="text-gray-400 flex-shrink-0" />
              <p className="flex-1 text-xs font-medium text-gray-700 truncate" title={pdfFile?.name}>
                {pdfFile?.name ?? 'PDF Preview'}
              </p>
              <button
                onClick={() => setShowPdf(false)}
                className="w-6 h-6 rounded flex items-center justify-center text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
                title="Close PDF panel"
              >
                <X size={13} />
              </button>
            </div>
            {/* iframe */}
            <div className="flex-1 overflow-hidden">
              <iframe
                key={pdfUrl}
                src={pdfUrl}
                title={pdfFile?.name || 'PDF'}
                className="w-full h-full border-none"
              />
            </div>
          </div>
        </>
      )}
    </main>
  );
}
