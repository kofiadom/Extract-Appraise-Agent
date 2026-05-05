import { useState, useCallback, useRef, useEffect } from 'react';
import { AlertCircle, RefreshCw, BookOpen, ClipboardList, Download, FileText, MessageSquare, FlaskConical } from 'lucide-react';
import Sidebar from './components/Sidebar.jsx';
import HistoryDrawer from './components/HistoryDrawer.jsx';
import StepIndicator from './components/StepIndicator.jsx';
import UploadZone from './components/UploadZone.jsx';
import DocumentProgressList from './components/DocumentProgressList.jsx';
import MetricsBar from './components/MetricsBar.jsx';
import EvidenceTab from './components/EvidenceTab.jsx';
import AppraisalTab from './components/AppraisalTab.jsx';
import DownloadTab from './components/DownloadTab.jsx';
import PdfViewer from './components/PdfViewer.jsx';
import ChatWithDoc from './components/ChatWithDoc.jsx';
import AuthScreen from './components/AuthScreen.jsx';
import {
  getToken,
  clearToken,
  uploadFiles,
  startPipelineJob,
  startPipelineBatch,
  pollPipelineJob,
  getPipelineResult,
  findParsedResult,
  sumMetrics,
} from './services/api.js';

const TABS = [
  { id: 'evidence', label: 'Evidence', icon: BookOpen },
  { id: 'appraisal', label: 'Appraisal', icon: ClipboardList },
  { id: 'downloads', label: 'Downloads', icon: Download },
];

const APP_MODES = [
  { id: 'extractor', label: 'Evidence Extractor', icon: FlaskConical },
  { id: 'chat',      label: 'Chat with Doc',      icon: MessageSquare },
];

/** Strip userId prefix and .md extension from a markdown filename for display. */
function toDisplayName(fileName) {
  let name = fileName.replace(/\.md$/i, '');
  // Strip UUID prefix (36 chars + underscore)
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}_/i.test(name)) {
    name = name.slice(37);
  }
  return name || fileName;
}

export default function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(!!getToken());
  const [appMode, setAppMode] = useState('extractor');
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [phase, setPhase] = useState('idle');
  const [files, setFiles] = useState([]);
  const [markdownFiles, setMarkdownFiles] = useState([]);
  const [currentJobId, setCurrentJobId] = useState(null);
  // Per-document tracking: [{ jobId, fileName, displayName, status, progress, error }]
  const [docStatuses, setDocStatuses] = useState([]);
  const [results, setResults] = useState(null);
  const [metrics, setMetrics] = useState(null);
  const [elapsedMs, setElapsedMs] = useState(null);
  const [errorMsg, setErrorMsg] = useState('');
  const [activeTab, setActiveTab] = useState('evidence');
  const [showPdf, setShowPdf] = useState(false);
  const [pdfWidthPct, setPdfWidthPct] = useState(45);
  const isDragging = useRef(false);
  const dragStartX = useRef(0);
  const dragStartPct = useRef(45);
  const mainRef = useRef(null);

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
      const mainWidth = mainRef.current.getBoundingClientRect().width;
      const deltaX = e.clientX - dragStartX.current;
      const deltaPct = (deltaX / mainWidth) * 100;
      const newPct = Math.min(75, Math.max(20, dragStartPct.current - deltaPct));
      setPdfWidthPct(newPct);
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

  const handleLogin = useCallback((token) => {
    setIsAuthenticated(!!token);
  }, []);

  const handleLogout = useCallback(() => {
    clearToken();
    setIsAuthenticated(false);
    setPhase('idle');
    setFiles([]);
    setMarkdownFiles([]);
    setDocStatuses([]);
    setResults(null);
    setMetrics(null);
    setElapsedMs(null);
    setErrorMsg('');
    setCurrentJobId(null);
  }, []);

  // --- Upload phase ---
  const handleUpload = useCallback(async () => {
    if (!files.length) return;
    setPhase('uploading');
    setErrorMsg('');
    try {
      const data = await uploadFiles(files);
      setMarkdownFiles(data.markdownFiles || data.markdown_files || []);
      setPhase('uploaded');
    } catch (err) {
      const msg =
        err?.response?.data?.detail ||
        err?.response?.data?.message ||
        err.message ||
        'Upload failed. Please try again.';
      setErrorMsg(msg);
      setPhase('error');
    }
  }, [files]);

  // --- Pipeline run phase ---
  // Single file  → /pipeline/run        — one combined job, original fast path
  // Multiple files → /pipeline/run-batch — one independent BullMQ job per file
  //   Each file's result is stored separately in the DB and accessible from Run
  //   History. The result page shows only the LAST document to finish; the rest
  //   are found in Run History.
  //   FastAPI-level semaphore (MAX_CONCURRENT_PIPELINES) prevents Bedrock overload
  //   regardless of how many BullMQ jobs start concurrently.
  const handleRun = useCallback(async () => {
    setPhase('running');
    setErrorMsg('');
    const startTs = Date.now();
    const isSingleFile = markdownFiles.length === 1;

    try {
      if (isSingleFile) {
        // ── Single-file path ──────────────────────────────────────────────────
        const jobId = await startPipelineJob(markdownFiles);
        setCurrentJobId(jobId);
        setDocStatuses([{
          jobId,
          fileName: markdownFiles[0],
          displayName: toDisplayName(markdownFiles[0]),
          status: 'queued',
          progress: 0,
          error: null,
        }]);

        const POLL_INTERVAL = 6_000;
        const terminalStatuses = new Set(['completed', 'failed', 'cancelled']);
        let lastJob = { status: 'queued', progress: 0 };

        while (!terminalStatuses.has(lastJob.status)) {
          await new Promise((r) => setTimeout(r, POLL_INTERVAL));
          try {
            lastJob = await pollPipelineJob(jobId);
            setDocStatuses([{
              jobId,
              fileName: markdownFiles[0],
              displayName: toDisplayName(markdownFiles[0]),
              status: terminalStatuses.has(lastJob.status) ? lastJob.status : 'active',
              progress: lastJob.progress ?? 0,
              error: lastJob.error ?? null,
            }]);
          } catch { /* network hiccup — keep polling */ }
        }

        setElapsedMs(Date.now() - startTs);
        if (lastJob.status === 'failed') throw new Error(lastJob.error || 'Pipeline failed.');

        const raw = await getPipelineResult(jobId);
        const parsed = findParsedResult(raw);
        setMetrics(sumMetrics(raw));
        if (parsed) {
          setResults(parsed);
          setPhase('done');
          setActiveTab('evidence');
        } else {
          setResults({ papers: [], appraisal: { appraisals: [] }, _raw: raw?.content });
          setPhase('done');
          setErrorMsg('Pipeline completed but the response could not be parsed into structured data.');
        }

      } else {
        // ── Multi-file path — one independent BullMQ job per file ────────────
        const batchJobs = await startPipelineBatch(markdownFiles);

        const initial = batchJobs.map((j) => ({
          jobId: j.jobId,
          fileName: j.fileName,
          displayName: toDisplayName(j.fileName),
          status: 'queued',
          progress: 0,
          error: null,
          completedAt: null,   // track order of completion
        }));
        setDocStatuses(initial);
        setCurrentJobId(batchJobs[0]?.jobId ?? null);

        const POLL_INTERVAL = 6_000;
        const terminalStatuses = new Set(['completed', 'failed', 'cancelled']);
        const tracker = initial.map((d) => ({ ...d }));

        while (tracker.some((d) => !terminalStatuses.has(d.status))) {
          await new Promise((r) => setTimeout(r, POLL_INTERVAL));
          await Promise.all(
            tracker.map(async (doc, i) => {
              if (terminalStatuses.has(doc.status)) return;
              try {
                const job = await pollPipelineJob(doc.jobId);
                const justCompleted = job.status === 'completed' && tracker[i].status !== 'completed';
                tracker[i] = {
                  ...tracker[i],
                  status: job.status,
                  progress: job.progress ?? tracker[i].progress,
                  error: job.error ?? null,
                  completedAt: justCompleted ? Date.now() : tracker[i].completedAt,
                };
              } catch { /* network hiccup */ }
            }),
          );
          setDocStatuses(tracker.map((d) => ({ ...d })));
        }

        setElapsedMs(Date.now() - startTs);

        // Find the last document to finish (highest completedAt timestamp)
        const completed = tracker
          .filter((d) => d.status === 'completed')
          .sort((a, b) => (b.completedAt || 0) - (a.completedAt || 0));

        if (completed.length === 0) {
          throw new Error('All documents failed to process.');
        }

        // Show only the last-to-finish result on the page.
        // All completed jobs are already in the DB and will appear in Run History.
        const lastFinished = completed[0];
        const raw = await getPipelineResult(lastFinished.jobId);
        const parsed = findParsedResult(raw);
        setCurrentJobId(lastFinished.jobId);
        setMetrics(sumMetrics(raw));

        const failedCount = tracker.filter((d) => d.status === 'failed').length;
        if (parsed) {
          setResults(parsed);
          setPhase('done');
          setActiveTab('evidence');
          if (failedCount > 0) {
            setErrorMsg(`${failedCount} document(s) failed. Showing result for "${lastFinished.displayName}". Others are in Run History.`);
          } else if (completed.length > 1) {
            setErrorMsg(`Showing result for "${lastFinished.displayName}" (last to finish). Open Run History to see the other ${completed.length - 1} result(s).`);
          }
        } else {
          setResults({ papers: [], appraisal: { appraisals: [] } });
          setPhase('done');
          setErrorMsg('Pipeline completed but the response could not be parsed into structured data.');
        }
      }
    } catch (err) {
      setElapsedMs(Date.now() - startTs);
      const msg =
        err?.response?.data?.detail ||
        err?.response?.data?.message ||
        err.message ||
        'Pipeline run failed. Please try again.';
      setErrorMsg(msg);
      setPhase('error');
    }
  }, [markdownFiles]);

  // --- Load a historical result from the history drawer ---
  const loadHistoricalResult = useCallback(({ metrics: m, jobId, raw }) => {
    const parsed = findParsedResult(raw);
    setCurrentJobId(jobId);
    setMetrics(m);
    setElapsedMs(null);
    setFiles([]);
    setMarkdownFiles([]);
    setShowPdf(false);
    setErrorMsg('');
    if (parsed) {
      setResults(parsed);
      setPhase('done');
      setActiveTab('evidence');
    } else {
      setResults({ papers: [], appraisal: { appraisals: [] }, _raw: raw?.content });
      setPhase('done');
      setErrorMsg('Results loaded but could not be parsed into structured data.');
    }
  }, []);

  // --- Reset (local state only — no API call needed) ---
  const handleReset = useCallback(() => {
    setPhase('idle');
    setFiles([]);
    setMarkdownFiles([]);
    setDocStatuses([]);
    setResults(null);
    setMetrics(null);
    setElapsedMs(null);
    setErrorMsg('');
    setActiveTab('evidence');
    setCurrentJobId(null);
  }, []);

  if (!isAuthenticated) {
    return <AuthScreen onLogin={handleLogin} />;
  }

  const papers = results?.papers ?? [];
  const appraisals = results?.appraisal?.appraisals || results?.appraisals || [];

  return (
    <div className="flex min-h-screen" style={{ background: '#F8FAFC' }}>
      <Sidebar
        onReset={handleReset}
        onLogout={handleLogout}
        onOpenHistory={() => setHistoryOpen(true)}
        phase={phase}
        isOpen={sidebarOpen}
        onToggle={() => setSidebarOpen((v) => !v)}
      />

      <HistoryDrawer
        open={historyOpen}
        onClose={() => setHistoryOpen(false)}
        onLoadResult={loadHistoricalResult}
      />

      <main
        ref={mainRef}
        className={`flex-1 transition-all duration-200 ${showPdf && phase === 'done' ? 'flex overflow-hidden h-screen' : 'min-h-screen'}`}
        style={{ marginLeft: sidebarOpen ? 260 : 48 }}
      >
        <div className={`${showPdf && phase === 'done' ? 'flex-1 overflow-y-auto' : ''}`}>
        <div className={showPdf && phase === 'done' ? 'px-6 py-8' : 'max-w-5xl mx-auto px-8 py-10'}>

          {/* Page header + mode switcher */}
          <div className="mb-8 flex items-start justify-between gap-4 flex-wrap">
            <div>
              <h1 className="text-2xl font-bold text-gray-900 tracking-tight">
                {appMode === 'extractor' ? 'RES' : 'Chat with Your Document'}
              </h1>
              <p className="text-sm text-gray-500 mt-1">
                {appMode === 'extractor'
                  ? 'Upload research papers to extract structured evidence and perform quality appraisal.'
                  : 'Index any PDF with PageIndex and ask questions using vectorless, reasoning-based retrieval.'}
              </p>
            </div>

            <div className="flex items-center gap-1 p-1 bg-white rounded-xl border border-gray-100 shadow-card flex-shrink-0">
              {APP_MODES.map(({ id, label, icon: Icon }) => (
                <button
                  key={id}
                  onClick={() => setAppMode(id)}
                  className={`flex items-center gap-2 px-3.5 py-2 rounded-lg text-sm font-medium transition-all duration-150 ${
                    appMode === id
                      ? 'bg-[#1B2A4A] text-white shadow-sm'
                      : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'
                  }`}
                >
                  <Icon size={14} />
                  {label}
                </button>
              ))}
            </div>
          </div>

          {/* ── Chat with Doc mode ── */}
          {appMode === 'chat' && <ChatWithDoc />}

          {/* ── Evidence Extractor mode ── */}
          {appMode === 'extractor' && <>

          <StepIndicator phase={phase} />

          {errorMsg && phase !== 'error' && (
            <div className="mb-6 flex items-start gap-3 p-4 rounded-xl bg-amber-50 border border-amber-200">
              <AlertCircle size={16} className="text-amber-600 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-medium text-amber-800">Warning</p>
                <p className="text-xs text-amber-700 mt-0.5 leading-relaxed">{errorMsg}</p>
              </div>
            </div>
          )}

          {phase === 'error' && (
            <div className="mb-6">
              <div className="rounded-xl bg-red-50 border border-red-200 p-5">
                <div className="flex items-start gap-3">
                  <AlertCircle size={18} className="text-red-500 flex-shrink-0 mt-0.5" />
                  <div className="flex-1">
                    <p className="text-sm font-semibold text-red-800">Something went wrong</p>
                    <p className="text-xs text-red-700 mt-1 leading-relaxed">{errorMsg}</p>
                    <div className="flex gap-3 mt-3">
                      <button
                        onClick={() => { setPhase('idle'); setErrorMsg(''); setFiles([]); }}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-100 text-red-700 text-xs font-medium hover:bg-red-200 transition-colors"
                      >
                        <RefreshCw size={12} />
                        Start over
                      </button>
                      {markdownFiles.length > 0 && (
                        <button
                          onClick={() => { setPhase('uploaded'); setErrorMsg(''); }}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white text-gray-600 text-xs font-medium border border-gray-200 hover:bg-gray-50 transition-colors"
                        >
                          Retry pipeline
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {phase !== 'done' && (
            <div className="card p-6 mb-6">
              <h2 className="text-sm font-semibold text-gray-700 mb-4">Upload Research Papers</h2>
              <UploadZone
                files={files}
                onFilesChange={setFiles}
                phase={phase}
                onUpload={handleUpload}
                onRun={handleRun}
              />
            </div>
          )}

          {/* Per-document progress tracker — visible during 'running' phase */}
          {phase === 'running' && docStatuses.length > 0 && (
            <div className="mb-6">
              <DocumentProgressList docStatuses={docStatuses} />
            </div>
          )}

          {phase === 'done' && (
            <>
              <MetricsBar
                metrics={metrics}
                papersCount={papers.length}
                appraised={appraisals.length}
                elapsedMs={elapsedMs}
              />

              <div className="flex items-center justify-between mb-4 gap-3 flex-wrap">
                <div className="flex items-center gap-1 p-1 bg-white rounded-xl border border-gray-100 shadow-card inline-flex">
                  {TABS.map(({ id, label, icon: Icon }) => (
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

                {files.length > 0 && (
                  <button
                    onClick={() => setShowPdf((v) => !v)}
                    className={`flex items-center gap-2 px-3.5 py-2 rounded-lg text-sm font-medium border transition-all duration-150 ${
                      showPdf
                        ? 'bg-[#1B2A4A] text-white border-[#1B2A4A]'
                        : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                    }`}
                  >
                    <FileText size={14} />
                    {showPdf ? 'Hide PDF' : 'View PDF'}
                  </button>
                )}
              </div>

              <div>
                {activeTab === 'evidence' && <EvidenceTab papers={papers} />}
                {activeTab === 'appraisal' && <AppraisalTab appraisals={appraisals} />}
                {activeTab === 'downloads' && <DownloadTab jobId={currentJobId} />}
              </div>
            </>
          )}
          </>}
        </div>
        </div>

        {showPdf && phase === 'done' && (
          <>
            <div
              onMouseDown={handleDividerMouseDown}
              className="flex-shrink-0 w-1.5 cursor-col-resize hover:bg-[#1B2A4A]/20 active:bg-[#1B2A4A]/40 transition-colors relative group"
              style={{ background: '#E2E8F0' }}
              title="Drag to resize"
            >
              <div className="absolute inset-y-0 left-1/2 -translate-x-1/2 flex flex-col items-center justify-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                {[0,1,2].map(i => (
                  <span key={i} className="w-1 h-1 rounded-full bg-gray-400" />
                ))}
              </div>
            </div>
            <div className="flex-shrink-0 sticky top-0 h-screen" style={{ width: `${pdfWidthPct}%` }}>
              <PdfViewer files={files} onClose={() => setShowPdf(false)} />
            </div>
          </>
        )}
      </main>
    </div>
  );
}
