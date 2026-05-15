import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import {
  BookOpen, ClipboardList, Download, FileText, ArrowLeft, Loader2, AlertCircle, X,
} from 'lucide-react';
import MetricsBar from '../components/MetricsBar.jsx';
import EvidenceTab from '../components/EvidenceTab.jsx';
import AppraisalTab from '../components/AppraisalTab.jsx';
import DownloadTab from '../components/DownloadTab.jsx';
import {
  getPipelineResult,
  getPipelinePdf,
  pollPipelineJob,
  findParsedResult,
  sumMetrics,
} from '../services/api.js';

const TABS = [
  { id: 'evidence',  label: 'Evidence',  icon: BookOpen },
  { id: 'appraisal', label: 'Appraisal', icon: ClipboardList },
  { id: 'downloads', label: 'Downloads', icon: Download },
];

export default function ResultsPage({ sidebarOpen }) {
  const { jobId } = useParams();
  const navigate  = useNavigate();
  const location  = useLocation();
  // File object passed from UploadPage via navigate state (available for fresh runs)
  const inMemoryFile = location.state?.file ?? null;
  // Human-readable document name — from in-memory file (fresh) or state passed by HistoryDrawer
  const docName = inMemoryFile
    ? inMemoryFile.name.replace(/\.pdf$/i, '')
    : (location.state?.docName ?? null);

  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState(null);
  const [results, setResults] = useState(null);
  const [metrics, setMetrics] = useState(null);
  // Seed from navigate state for fresh runs; history runs fall back to API metrics
  const [elapsedMs, setElapsedMs] = useState(location.state?.elapsedMs ?? null);
  const [activeTab, setActiveTab] = useState('evidence');

  // PDF state
  const [pdfUrl, setPdfUrl]               = useState(null);
  const [showPdf, setShowPdf]             = useState(false);
  const [pdfWidthPct, setPdfWidthPct]     = useState(45);
  const [pdfFetchLoading, setPdfFetchLoading] = useState(false);
  const [pdfFetchError, setPdfFetchError]     = useState(false);
  const pdfUrlRef  = useRef(null);
  const mainRef    = useRef(null);
  const isDragging = useRef(false);
  const dragStartX = useRef(0);
  const dragStartPct = useRef(45);

  // Load result on mount
  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const raw = await getPipelineResult(jobId);
        if (cancelled) return;
        const parsed = findParsedResult(raw);
        const m = sumMetrics(raw);
        setMetrics(m);
        // For history runs (no navigate state), compute from job timestamps.
        // Fresh runs already have elapsedMs seeded from navigate state.
        if (location.state?.elapsedMs == null) {
          const jobStatus = await pollPipelineJob(jobId);
          if (!cancelled && jobStatus?.createdAt && jobStatus?.updatedAt) {
            const ms = new Date(jobStatus.updatedAt).getTime() - new Date(jobStatus.createdAt).getTime();
            if (ms > 0) setElapsedMs(ms);
          }
        }
        setResults(parsed ?? { papers: [], appraisal: { appraisals: [] } });

        const hasPapers     = parsed?.papers?.length > 0;
        const hasAppraisals = (parsed?.appraisal?.appraisals?.length > 0) || (parsed?.appraisals?.length > 0);
        if (hasPapers) setActiveTab('evidence');
        else if (hasAppraisals) setActiveTab('appraisal');
      } catch (err) {
        if (!cancelled) setError(err?.response?.data?.message || err.message || 'Failed to load results.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [jobId]);

  // Resolve PDF URL:
  //   1. If we have the File in memory (fresh run from UploadPage) → use it immediately
  //   2. Otherwise probe the backend endpoint (works for new history runs with fileMapping)
  useEffect(() => {
    let cancelled = false;

    // Cleanup previous URL
    if (pdfUrlRef.current) {
      URL.revokeObjectURL(pdfUrlRef.current);
      pdfUrlRef.current = null;
    }

    if (inMemoryFile) {
      const url = URL.createObjectURL(inMemoryFile);
      pdfUrlRef.current = url;
      setPdfUrl(url);
      return () => {
        cancelled = true;
        URL.revokeObjectURL(url);
        pdfUrlRef.current = null;
      };
    }

    // No in-memory file — try fetching from backend (history runs)
    async function probePdf() {
      try {
        const url = await getPipelinePdf(jobId);
        if (cancelled) { URL.revokeObjectURL(url); return; }
        pdfUrlRef.current = url;
        setPdfUrl(url);
      } catch {
        // PDF not available (old job without fileMapping, or file deleted) — hide button
      }
    }
    probePdf();
    return () => {
      cancelled = true;
      if (pdfUrlRef.current) {
        URL.revokeObjectURL(pdfUrlRef.current);
        pdfUrlRef.current = null;
      }
    };
  }, [jobId, inMemoryFile]);

  // PDF button click — toggle if already loaded, otherwise fetch on demand
  async function handleViewPdfClick() {
    if (pdfUrl) {
      setShowPdf((v) => !v);
      return;
    }
    if (pdfFetchLoading) return;
    if (inMemoryFile) return; // pdfUrl should already be set from the effect
    setPdfFetchLoading(true);
    setPdfFetchError(false);
    try {
      const url = await getPipelinePdf(jobId);
      pdfUrlRef.current = url;
      setPdfUrl(url);
      setShowPdf(true);
    } catch {
      setPdfFetchError(true);
    } finally {
      setPdfFetchLoading(false);
    }
  }

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
      setPdfWidthPct(Math.min(75, Math.max(20, dragStartPct.current - delta)));
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
  const papers     = results?.papers ?? [];
  const appraisals = results?.appraisal?.appraisals || results?.appraisals || [];

  const visibleTabs = TABS.filter(({ id }) => {
    if (id === 'evidence')  return papers.length > 0 || !results;
    if (id === 'appraisal') return appraisals.length > 0 || !results;
    return true;
  });

  if (loading) {
    return (
      <main className="flex-1 min-h-screen flex items-center justify-center" style={{ marginLeft }}>
        <div className="flex flex-col items-center gap-3 text-gray-400">
          <Loader2 size={28} className="animate-spin" />
          <p className="text-sm">Loading results…</p>
        </div>
      </main>
    );
  }

  if (error) {
    return (
      <main className="flex-1 min-h-screen flex items-center justify-center" style={{ marginLeft }}>
        <div className="text-center max-w-sm">
          <AlertCircle size={36} className="text-red-400 mx-auto mb-3" />
          <p className="text-sm font-semibold text-gray-700 mb-1">Could not load results</p>
          <p className="text-xs text-gray-500 mb-4">{error}</p>
          <button
            onClick={() => navigate('/')}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-[#1B2A4A] text-white text-sm font-medium hover:bg-[#243657] transition-colors"
          >
            <ArrowLeft size={14} />
            Back to upload
          </button>
        </div>
      </main>
    );
  }

  return (
    <main
      ref={mainRef}
      className={`flex-1 transition-all duration-200 ${showPdf ? 'flex overflow-hidden h-screen' : 'min-h-screen'}`}
      style={{ marginLeft }}
    >
      <div className={showPdf ? 'flex-1 overflow-y-auto' : ''}>
        <div className={showPdf ? 'px-6 py-8' : 'max-w-5xl mx-auto px-8 py-10'}>

          {/* Back button + title */}
          <div className="mb-6 flex items-center gap-3">
            <button
              onClick={() => {
                const fromDone = location.state?._fromUploadDone;
                navigate('/', fromDone ? { state: { _restoreUpload: fromDone } } : undefined);
              }}
              className="flex items-center gap-1.5 text-gray-400 hover:text-gray-600 text-sm font-medium transition-colors flex-shrink-0"
            >
              <ArrowLeft size={15} />
              Back
            </button>
            <span className="text-gray-200 flex-shrink-0">|</span>
            <div className="min-w-0">
              <p className="text-xs text-gray-400 font-medium uppercase tracking-wider leading-none mb-0.5">Results</p>
              <h1 className="text-lg font-bold text-gray-900 tracking-tight truncate" title={docName ?? undefined}>
                {docName ?? 'Extraction & Appraisal'}
              </h1>
            </div>
          </div>

          <MetricsBar
            metrics={metrics}
            papersCount={papers.length}
            appraised={appraisals.length}
            elapsedMs={elapsedMs}
          />

          {/* Tab bar + PDF toggle */}
          <div className="flex items-center justify-between mb-4 gap-3 flex-wrap">
            <div className="flex items-center gap-1 p-1 bg-white rounded-xl border border-gray-100 shadow-card inline-flex">
              {visibleTabs.map(({ id, label, icon: Icon }) => (
                <button
                  key={id}
                  onClick={() => setActiveTab(id)}
                  className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all duration-150 ${
                    activeTab === id
                      ? 'bg-[#1B2A4A] text-white shadow-sm'
                      : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'
                  }`}
                >
                  <Icon size={14} />
                  {label}
                  {id === 'evidence' && papers.length > 0 && (
                    <span className={`text-xs px-1.5 py-0.5 rounded-full font-semibold ${activeTab === id ? 'bg-white/20 text-white' : 'bg-gray-100 text-gray-500'}`}>
                      {papers.length}
                    </span>
                  )}
                  {id === 'appraisal' && appraisals.length > 0 && (
                    <span className={`text-xs px-1.5 py-0.5 rounded-full font-semibold ${activeTab === id ? 'bg-white/20 text-white' : 'bg-gray-100 text-gray-500'}`}>
                      {appraisals.length}
                    </span>
                  )}
                </button>
              ))}
            </div>

            {!loading && !error && (
              <button
                onClick={handleViewPdfClick}
                disabled={pdfFetchLoading}
                className={`flex items-center gap-2 px-3.5 py-2 rounded-lg text-sm font-medium border transition-all duration-150 disabled:opacity-60 ${
                  showPdf
                    ? 'bg-[#1B2A4A] text-white border-[#1B2A4A]'
                    : pdfFetchError
                    ? 'bg-red-50 text-red-400 border-red-200 cursor-not-allowed'
                    : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                }`}
                title={pdfFetchError ? 'PDF not available for this run' : undefined}
              >
                {pdfFetchLoading
                  ? <Loader2 size={14} className="animate-spin" />
                  : <FileText size={14} />}
                {pdfFetchError ? 'PDF unavailable' : showPdf ? 'Hide PDF' : 'View PDF'}
              </button>
            )}
          </div>

          {/* Tab content */}
          <div>
            {activeTab === 'evidence'  && <EvidenceTab papers={papers} />}
            {activeTab === 'appraisal' && <AppraisalTab appraisals={appraisals} />}
            {activeTab === 'downloads' && <DownloadTab jobId={jobId} />}
          </div>
        </div>
      </div>

      {/* Resizable PDF panel */}
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
            className="flex-shrink-0 sticky top-0 h-screen flex flex-col bg-gray-50 border-l border-gray-200"
            style={{ width: `${pdfWidthPct}%` }}
          >
            {/* PDF toolbar */}
            <div className="flex items-center gap-2 px-4 py-2.5 bg-white border-b border-gray-200 flex-shrink-0">
              <FileText size={14} className="text-gray-400 flex-shrink-0" />
              <p className="flex-1 text-xs font-medium text-gray-700 truncate" title={inMemoryFile?.name}>
                {inMemoryFile?.name ?? 'PDF Preview'}
              </p>
              <button
                onClick={() => setShowPdf(false)}
                className="w-6 h-6 rounded flex items-center justify-center text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
                title="Close PDF viewer"
              >
                <X size={13} />
              </button>
            </div>
            {/* PDF iframe */}
            <div className="flex-1 overflow-hidden">
              <iframe
                key={pdfUrl}
                src={pdfUrl}
                title="PDF Preview"
                className="w-full h-full border-none"
              />
            </div>
          </div>
        </>
      )}
    </main>
  );
}
