import { useState, useCallback } from 'react';
import { AlertCircle, RefreshCw, BookOpen, ClipboardList, Download } from 'lucide-react';
import Sidebar from './components/Sidebar.jsx';
import StepIndicator from './components/StepIndicator.jsx';
import UploadZone from './components/UploadZone.jsx';
import MetricsBar from './components/MetricsBar.jsx';
import EvidenceTab from './components/EvidenceTab.jsx';
import AppraisalTab from './components/AppraisalTab.jsx';
import DownloadTab from './components/DownloadTab.jsx';
import {
  uploadFiles,
  runPipeline,
  storeResults,
  resetPipeline,
  parseTeamContent,
  sumMetrics,
  estimateCost,
} from './services/api.js';

const DEFAULT_API_URL =
  typeof import.meta !== 'undefined' && import.meta.env?.VITE_API_BASE_URL
    ? import.meta.env.VITE_API_BASE_URL
    : 'http://localhost:7777';

const TABS = [
  { id: 'evidence', label: 'Evidence', icon: BookOpen },
  { id: 'appraisal', label: 'Appraisal', icon: ClipboardList },
  { id: 'downloads', label: 'Downloads', icon: Download },
];

export default function App() {
  const [apiUrl, setApiUrl] = useState(DEFAULT_API_URL);
  const [phase, setPhase] = useState('idle'); // idle | uploading | uploaded | running | done | error
  const [files, setFiles] = useState([]);
  const [markdownFiles, setMarkdownFiles] = useState([]);
  const [results, setResults] = useState(null); // parsed pipeline data
  const [metrics, setMetrics] = useState(null);
  const [elapsedMs, setElapsedMs] = useState(null);
  const [errorMsg, setErrorMsg] = useState('');
  const [activeTab, setActiveTab] = useState('evidence');

  // --- Upload phase ---
  const handleUpload = useCallback(async () => {
    if (!files.length) return;
    setPhase('uploading');
    setErrorMsg('');
    try {
      const data = await uploadFiles(apiUrl, files);
      setMarkdownFiles(data.markdown_files || []);
      setPhase('uploaded');
    } catch (err) {
      const msg =
        err?.response?.data?.detail ||
        err?.response?.data?.message ||
        err.message ||
        'Upload failed. Please check the API URL and try again.';
      setErrorMsg(msg);
      setPhase('error');
    }
  }, [apiUrl, files]);

  // --- Pipeline run phase ---
  const handleRun = useCallback(async () => {
    setPhase('running');
    setErrorMsg('');
    const startTs = Date.now();
    try {
      const raw = await runPipeline(apiUrl, markdownFiles);
      const elapsed = Date.now() - startTs;
      setElapsedMs(elapsed);

      // Parse content
      const content = raw?.content ?? (typeof raw === 'string' ? raw : null);
      const parsed = parseTeamContent(content);

      // Compute metrics — fall back to pricing table if API doesn't return cost
      const m = sumMetrics(raw);
      if (!m.cost_usd && m.total_tokens > 0) {
        const modelId = raw?.model || '';
        m.cost_usd = estimateCost(modelId, m.input_tokens, m.output_tokens);
      }
      setMetrics(m);

      if (parsed) {
        setResults(parsed);
        // Store on backend for downloads
        try {
          await storeResults(apiUrl, parsed);
        } catch {
          // Non-fatal — downloads won't work but results still shown
        }
        setPhase('done');
        setActiveTab('evidence');
      } else {
        // We have a response but couldn't parse it — still show what we have
        setResults({ papers: [], appraisal: { appraisals: [] }, _raw: content });
        setPhase('done');
        setErrorMsg(
          'Pipeline completed but the response could not be parsed into structured data. ' +
          'Raw content may be shown below.'
        );
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
  }, [apiUrl, markdownFiles]);

  // --- Reset ---
  const handleReset = useCallback(async () => {
    try {
      await resetPipeline(apiUrl);
    } catch {
      // Ignore backend errors during reset
    }
    setPhase('idle');
    setFiles([]);
    setMarkdownFiles([]);
    setResults(null);
    setMetrics(null);
    setElapsedMs(null);
    setErrorMsg('');
    setActiveTab('evidence');
  }, [apiUrl]);

  const papers = results?.papers ?? [];
  const appraisals =
    results?.appraisal?.appraisals ||
    results?.appraisals ||
    [];

  return (
    <div className="flex min-h-screen" style={{ background: '#F8FAFC' }}>
      {/* Sidebar */}
      <Sidebar
        apiUrl={apiUrl}
        onApiUrlChange={setApiUrl}
        onReset={handleReset}
        phase={phase}
      />

      {/* Main content */}
      <main
        className="flex-1 min-h-screen"
        style={{ marginLeft: 260 }}
      >
        <div className="max-w-5xl mx-auto px-8 py-10">
          {/* Page header */}
          <div className="mb-8">
            <h1 className="text-2xl font-bold text-gray-900 tracking-tight">
              REST Evidence Extractor
            </h1>
            <p className="text-sm text-gray-500 mt-1">
              Upload research papers to extract structured evidence and perform quality appraisal.
            </p>
          </div>

          {/* Step indicator */}
          <StepIndicator phase={phase} />

          {/* Error banner (non-blocking) */}
          {errorMsg && phase !== 'error' && (
            <div className="mb-6 flex items-start gap-3 p-4 rounded-xl bg-amber-50 border border-amber-200">
              <AlertCircle size={16} className="text-amber-600 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-medium text-amber-800">Warning</p>
                <p className="text-xs text-amber-700 mt-0.5 leading-relaxed">{errorMsg}</p>
              </div>
            </div>
          )}

          {/* Error state (blocking) */}
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

          {/* Upload section — shown in all phases except done */}
          {phase !== 'done' && (
            <div className="card p-6 mb-6">
              <h2 className="text-sm font-semibold text-gray-700 mb-4">
                Upload Research Papers
              </h2>
              <UploadZone
                files={files}
                onFilesChange={setFiles}
                phase={phase}
                onUpload={handleUpload}
                onRun={handleRun}
              />
            </div>
          )}

          {/* Done state — metrics + results tabs */}
          {phase === 'done' && (
            <>
              {/* Metrics bar */}
              <MetricsBar
                metrics={metrics}
                papersCount={papers.length}
                appraised={appraisals.length}
                elapsedMs={elapsedMs}
              />

              {/* Tabs */}
              <div className="mb-4">
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
                        <span
                          className={`text-xs px-1.5 py-0.5 rounded-full font-semibold ${
                            activeTab === id
                              ? 'bg-white/20 text-white'
                              : 'bg-gray-100 text-gray-500'
                          }`}
                        >
                          {papers.length}
                        </span>
                      )}
                      {id === 'appraisal' && appraisals.length > 0 && (
                        <span
                          className={`text-xs px-1.5 py-0.5 rounded-full font-semibold ${
                            activeTab === id
                              ? 'bg-white/20 text-white'
                              : 'bg-gray-100 text-gray-500'
                          }`}
                        >
                          {appraisals.length}
                        </span>
                      )}
                    </button>
                  ))}
                </div>
              </div>

              {/* Tab content */}
              <div>
                {activeTab === 'evidence' && <EvidenceTab papers={papers} />}
                {activeTab === 'appraisal' && <AppraisalTab appraisals={appraisals} />}
                {activeTab === 'downloads' && <DownloadTab apiUrl={apiUrl} />}
              </div>
            </>
          )}
        </div>
      </main>
    </div>
  );
}
