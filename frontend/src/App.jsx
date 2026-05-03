import { useState, useCallback, useRef, useEffect } from 'react';
import { AlertCircle, RefreshCw, BookOpen, ClipboardList, Download, FileText, MessageSquare, FlaskConical } from 'lucide-react';
import Sidebar from './components/Sidebar.jsx';
import HistoryDrawer from './components/HistoryDrawer.jsx';
import StepIndicator from './components/StepIndicator.jsx';
import UploadZone from './components/UploadZone.jsx';
import MetricsBar from './components/MetricsBar.jsx';
import EvidenceTab from './components/EvidenceTab.jsx';
import AppraisalTab from './components/AppraisalTab.jsx';
import DownloadTab from './components/DownloadTab.jsx';
import PdfViewer from './components/PdfViewer.jsx';
import ChatWithDoc from './components/ChatWithDoc.jsx';
import AuthScreen from './components/AuthScreen.jsx';
import DocumentProgressList from './components/DocumentProgressList.jsx';
import {
  getToken,
  clearToken,
  uploadFiles,
  startPipelineJob,
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

export default function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(!!getToken());
  const [appMode, setAppMode] = useState('extractor');
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [phase, setPhase] = useState('idle');
  const [files, setFiles] = useState([]);
  const [markdownFiles, setMarkdownFiles] = useState([]);
  const [currentJobIds, setCurrentJobIds] = useState([]);
  const [jobStatuses, setJobStatuses] = useState({}); // { jobId: { status: 'queued'|'running'|'completed'|'failed', name: string, error?: string } }
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
    setResults(null);
    setMetrics(null);
    setElapsedMs(null);
    setErrorMsg('');
    setCurrentJobIds([]);
    setJobStatuses({});
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
  const handleRun = useCallback(async () => {
    setPhase('running');
    setErrorMsg('');
    const startTs = Date.now();
    try {
      const jobIds = await startPipelineJob(markdownFiles);
      setCurrentJobIds(jobIds);

      // Initialize job statuses - map each jobId to its corresponding document name
      const initialStatuses = {};
      jobIds.forEach((jobId, index) => {
        const fileName = files[index]?.name || `Document ${index + 1}`;
        initialStatuses[jobId] = { status: 'queued', name: fileName };
      });
      setJobStatuses(initialStatuses);

      // Poll all jobs concurrently until all are completed or failed
      const pollJobs = async () => {
        const promises = jobIds.map(async (jobId) => {
          try {
            const job = await pollPipelineJob(jobId);
            setJobStatuses(prev => ({
              ...prev,
              [jobId]: { ...prev[jobId], status: job.status, error: job.error }
            }));
            return { jobId, status: job.status, result: job.status === 'completed' ? await getPipelineResult(jobId) : null };
          } catch (err) {
            setJobStatuses(prev => ({
              ...prev,
              [jobId]: { ...prev[jobId], status: 'failed', error: err.message }
            }));
            return { jobId, status: 'failed', error: err.message };
          }
        });

        return Promise.all(promises);
      };

      // Poll every 3 seconds until all jobs are done
      let allCompleted = false;
      while (!allCompleted) {
        await new Promise((r) => setTimeout(r, 3_000));
        const jobResults = await pollJobs();

        allCompleted = jobResults.every(result =>
          result.status === 'completed' || result.status === 'failed'
        );

        if (allCompleted) {
          // Aggregate results from all completed jobs
          const completedResults = jobResults.filter(r => r.status === 'completed' && r.result);
          const failedJobs = jobResults.filter(r => r.status === 'failed');

          if (completedResults.length === 0) {
            throw new Error('All pipeline jobs failed');
          }

          // Aggregate papers and appraisals from all results
          const allPapers = [];
          const allAppraisals = [];
          let totalMetrics = { input_tokens: 0, output_tokens: 0, total_tokens: 0, cost_usd: 0, by_model: {} };

          completedResults.forEach(({ result }) => {
            const parsed = findParsedResult(result);
            if (parsed) {
              allPapers.push(...(parsed.papers || []));
              allAppraisals.push(...(parsed.appraisal?.appraisals || []));
            }
            const jobMetrics = sumMetrics(result);
            totalMetrics.input_tokens += jobMetrics.input_tokens;
            totalMetrics.output_tokens += jobMetrics.output_tokens;
            totalMetrics.total_tokens += jobMetrics.total_tokens;
            totalMetrics.cost_usd += jobMetrics.cost_usd;
            // Merge by_model
            Object.entries(jobMetrics.by_model).forEach(([model, modelMetrics]) => {
              if (!totalMetrics.by_model[model]) {
                totalMetrics.by_model[model] = { input_tokens: 0, output_tokens: 0, cost_usd: 0 };
              }
              totalMetrics.by_model[model].input_tokens += modelMetrics.input_tokens;
              totalMetrics.by_model[model].output_tokens += modelMetrics.output_tokens;
              totalMetrics.by_model[model].cost_usd += modelMetrics.cost_usd;
            });
          });

          setElapsedMs(Date.now() - startTs);
          setMetrics(totalMetrics);

          const aggregatedResults = {
            papers: allPapers,
            appraisal: { appraisals: allAppraisals }
          };

          setResults(aggregatedResults);
          setPhase('done');
          setActiveTab('evidence');

          // Show warning if some jobs failed
          if (failedJobs.length > 0) {
            setErrorMsg(`${failedJobs.length} document(s) failed to process. Results shown for ${completedResults.length} successful document(s).`);
          }
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
  }, [markdownFiles, files]);

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
    setResults(null);
    setMetrics(null);
    setElapsedMs(null);
    setErrorMsg('');
    setActiveTab('evidence');
    setCurrentJobIds([]);
    setJobStatuses({});
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

          {phase === 'running' && Object.keys(jobStatuses).length > 0 && (
            <DocumentProgressList jobStatuses={jobStatuses} />
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
                {activeTab === 'downloads' && <DownloadTab jobId={currentJobIds[0]} />}
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
