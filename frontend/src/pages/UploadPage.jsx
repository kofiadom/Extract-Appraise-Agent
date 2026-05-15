import { useState, useCallback, useEffect, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { AlertCircle, RefreshCw, BookOpen } from 'lucide-react';
import StepIndicator from '../components/StepIndicator.jsx';
import UploadZone from '../components/UploadZone.jsx';
import DocumentProgressList from '../components/DocumentProgressList.jsx';
import BulkDownloadButton from '../components/BulkDownloadButton.jsx';
import {
  uploadFiles,
  checkExistingResults,
  startPipelineJob,
  startPipelineBatch,
  pollPipelineJob,
  getPipelineResult,
  findParsedResult,
  sumMetrics,
} from '../services/api.js';

function toDisplayName(fileName) {
  let name = fileName.replace(/\.md$/i, '');
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}_/i.test(name)) {
    name = name.slice(37);
  }
  return name || fileName;
}

export default function UploadPage({ onPhaseChange, sidebarOpen }) {
  const navigate = useNavigate();
  const location = useLocation();
  const [phase, setPhase] = useState('idle');
  const [files, setFiles] = useState([]);
  const [markdownFiles, setMarkdownFiles] = useState([]);
  const [fileMapping, setFileMapping] = useState({});
  const [currentJobId, setCurrentJobId] = useState(null);
  const [docStatuses, setDocStatuses] = useState([]);
  const [errorMsg, setErrorMsg] = useState('');
  const [selectedSteps, setSelectedSteps] = useState(['extraction', 'appraisal']);
  const [duplicates, setDuplicates] = useState([]);
  // Map jobId → File so the results page can show the PDF without a backend round-trip
  const jobFileMapRef = useRef({});
  // Wall-clock start time per jobId so ResultsPage can display elapsed time
  const jobStartTimeRef = useRef({});
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  // Restore "done" phase when user navigates back from a batch result
  useEffect(() => {
    const restore = location.state?._restoreUpload;
    if (restore?.docStatuses?.length > 0) {
      setDocStatuses(restore.docStatuses);
      setPhase('done');
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Sync phase up to App layout (for sidebar status indicator)
  useEffect(() => { onPhaseChange?.(phase); }, [phase, onPhaseChange]);

  const setPhaseAndSync = useCallback((p) => {
    if (mountedRef.current) setPhase(p);
  }, []);

  const handleUpload = useCallback(async () => {
    if (!files.length) return;
    setPhaseAndSync('uploading');
    setErrorMsg('');
    setDuplicates([]);
    try {
      const data = await uploadFiles(files);
      const mdFiles = data.markdownFiles || data.markdown_files || [];
      const mapping = data.fileMapping || {};
      setMarkdownFiles(mdFiles);
      setFileMapping(mapping);
      try {
        const dupes = await checkExistingResults(mdFiles);
        if (mountedRef.current) setDuplicates(dupes ?? []);
      } catch { /* non-fatal */ }
      setPhaseAndSync('uploaded');
    } catch (err) {
      const msg =
        err?.response?.data?.detail ||
        err?.response?.data?.message ||
        err.message ||
        'Upload failed. Please try again.';
      if (mountedRef.current) setErrorMsg(msg);
      setPhaseAndSync('error');
    }
  }, [files, setPhaseAndSync]);

  const handleRun = useCallback(async () => {
    setPhaseAndSync('running');
    setErrorMsg('');
    const isSingleFile = markdownFiles.length === 1;

    try {
      if (isSingleFile) {
        const jobId = await startPipelineJob(markdownFiles, selectedSteps, fileMapping);
        if (!mountedRef.current) return;
        // Store file reference and start time so we can pass them to the results page
        jobFileMapRef.current[jobId] = files[0];
        jobStartTimeRef.current[jobId] = Date.now();
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
        const terminal = new Set(['completed', 'failed', 'cancelled']);
        let lastJob = { status: 'queued', progress: 0 };

        while (!terminal.has(lastJob.status)) {
          await new Promise((r) => setTimeout(r, POLL_INTERVAL));
          if (!mountedRef.current) return;
          try {
            lastJob = await pollPipelineJob(jobId);
            if (!mountedRef.current) return;
            setDocStatuses([{
              jobId,
              fileName: markdownFiles[0],
              displayName: toDisplayName(markdownFiles[0]),
              status: terminal.has(lastJob.status) ? lastJob.status : 'active',
              progress: lastJob.progress ?? 0,
              error: lastJob.error ?? null,
            }]);
          } catch { /* network hiccup */ }
        }

        if (!mountedRef.current) return;
        if (lastJob.status === 'failed') throw new Error(lastJob.error || 'Pipeline failed.');
        // Stay on page — user clicks "View Results" (same UX as multi-file)
        setDocStatuses([{
          jobId,
          fileName: markdownFiles[0],
          displayName: toDisplayName(markdownFiles[0]),
          status: 'completed',
          progress: 100,
          error: null,
        }]);
        setPhaseAndSync('done');

      } else {
        const batchJobs = await startPipelineBatch(markdownFiles, selectedSteps, fileMapping);
        if (!mountedRef.current) return;

        const batchStart = Date.now();
        // Map each jobId to the File that was uploaded (same order as markdownFiles)
        batchJobs.forEach((j, i) => {
          jobFileMapRef.current[j.jobId] = files[i] ?? null;
          jobStartTimeRef.current[j.jobId] = batchStart;
        });

        const initial = batchJobs.map((j) => ({
          jobId: j.jobId,
          fileName: j.fileName,
          displayName: toDisplayName(j.fileName),
          status: 'queued',
          progress: 0,
          error: null,
        }));
        setDocStatuses(initial);
        setCurrentJobId(batchJobs[0]?.jobId ?? null);

        const POLL_INTERVAL = 6_000;
        const terminal = new Set(['completed', 'failed', 'cancelled']);
        const tracker = initial.map((d) => ({ ...d }));

        while (tracker.some((d) => !terminal.has(d.status))) {
          await new Promise((r) => setTimeout(r, POLL_INTERVAL));
          if (!mountedRef.current) return;
          await Promise.all(
            tracker.map(async (doc, i) => {
              if (terminal.has(doc.status)) return;
              try {
                const job = await pollPipelineJob(doc.jobId);
                tracker[i] = {
                  ...tracker[i],
                  status: job.status,
                  progress: job.progress ?? tracker[i].progress,
                  error: job.error ?? null,
                };
              } catch { /* network hiccup */ }
            }),
          );
          if (!mountedRef.current) return;
          setDocStatuses(tracker.map((d) => ({ ...d })));
        }

        if (!mountedRef.current) return;
        const anyCompleted = tracker.some((d) => d.status === 'completed');
        if (!anyCompleted) throw new Error('All documents failed to process.');
        // Stay on this page — user clicks "View Results" on each completed doc
        setPhaseAndSync('done');
      }
    } catch (err) {
      if (!mountedRef.current) return;
      const msg =
        err?.response?.data?.detail ||
        err?.response?.data?.message ||
        err.message ||
        'Pipeline run failed. Please try again.';
      setErrorMsg(msg);
      setPhaseAndSync('error');
    }
  }, [markdownFiles, selectedSteps, fileMapping, navigate, setPhaseAndSync]);

  const handleLoadExisting = useCallback(async () => {
    if (!duplicates.length) return;
    setPhaseAndSync('running');
    setErrorMsg('');
    try {
      const sorted = [...duplicates].sort(
        (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
      );
      const latest = sorted[0];
      // Fetch result to verify it exists, then navigate
      await getPipelineResult(latest.jobId);
      if (!mountedRef.current) return;
      navigate(`/results/${latest.jobId}`);
    } catch (err) {
      if (!mountedRef.current) return;
      setErrorMsg(err?.response?.data?.message || err.message || 'Failed to load cached results.');
      setPhaseAndSync('error');
    }
  }, [duplicates, navigate, setPhaseAndSync]);

  const handleReset = useCallback(() => {
    setPhase('idle');
    setFiles([]);
    setMarkdownFiles([]);
    setFileMapping({});
    setDocStatuses([]);
    setErrorMsg('');
    setCurrentJobId(null);
    setSelectedSteps(['extraction', 'appraisal']);
    setDuplicates([]);
  }, []);

  const marginLeft = sidebarOpen ? 260 : 48;

  return (
    <main
      className="flex-1 min-h-screen"
      style={{ marginLeft, background: '#F8FAFC' }}
    >
      <div className="max-w-5xl mx-auto px-8 py-10">

        {/* Page header */}
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-gray-900 tracking-tight">RES</h1>
          <p className="text-sm text-gray-500 mt-1">
            Upload research papers to extract structured evidence and perform quality appraisal.
          </p>
        </div>

        <StepIndicator phase={phase} />

        {/* Warning banner */}
        {errorMsg && phase !== 'error' && (
          <div className="mb-6 flex items-start gap-3 p-4 rounded-xl bg-amber-50 border border-amber-200">
            <AlertCircle size={16} className="text-amber-600 flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-medium text-amber-800">Warning</p>
              <p className="text-xs text-amber-700 mt-0.5 leading-relaxed">{errorMsg}</p>
            </div>
          </div>
        )}

        {/* Error state */}
        {phase === 'error' && (
          <div className="mb-6 rounded-xl bg-red-50 border border-red-200 p-5">
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
        )}

        {/* Upload zone — visible in all phases except running/done */}
        {phase !== 'running' && phase !== 'done' && (
          <div className="card p-6 mb-6">
            <h2 className="text-sm font-semibold text-gray-700 mb-4">Upload Research Papers</h2>
            <UploadZone
              files={files}
              onFilesChange={setFiles}
              phase={phase}
              onUpload={handleUpload}
              onRun={handleRun}
              maxFiles={3}
              selectedSteps={selectedSteps}
              onStepsChange={setSelectedSteps}
            />

            {/* Duplicate results banner */}
            {phase === 'uploaded' && duplicates.length > 0 && (
              <div className="mt-5 rounded-xl border border-blue-200 bg-blue-50 p-4">
                <div className="flex items-start gap-3">
                  <div className="flex-shrink-0 w-8 h-8 rounded-lg bg-blue-100 flex items-center justify-center mt-0.5">
                    <BookOpen size={15} className="text-blue-600" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-blue-800">
                      Results already exist for{' '}
                      {duplicates.length === markdownFiles.length
                        ? 'all'
                        : `${duplicates.length} of ${markdownFiles.length}`}{' '}
                      file{duplicates.length !== 1 ? 's' : ''}
                    </p>
                    <ul className="mt-1.5 space-y-0.5">
                      {duplicates.map((d) => (
                        <li key={d.markdownFile} className="text-xs text-blue-700 flex items-center gap-1.5">
                          <span className="w-1.5 h-1.5 rounded-full bg-blue-400 flex-shrink-0" />
                          {d.markdownFile.replace(/^[^_]+_/, '').replace(/\.md$/, '')}
                          <span className="text-blue-400">
                            — {new Date(d.createdAt).toLocaleDateString()}
                          </span>
                        </li>
                      ))}
                    </ul>
                    <div className="flex items-center gap-2 mt-3">
                      <button
                        onClick={handleLoadExisting}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-600 text-white text-xs font-medium hover:bg-blue-700 transition-colors"
                      >
                        <BookOpen size={12} />
                        Load Existing Results
                      </button>
                      <span className="text-xs text-blue-400">
                        or use the run button below to reprocess
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Document progress list — running or done (multi-file) */}
        {(phase === 'running' || phase === 'done') && docStatuses.length > 0 && (
          <div className="mb-6">
            <DocumentProgressList
              docStatuses={docStatuses}
              allDone={phase === 'done'}
              onViewResult={(jobId) => {
                const start = jobStartTimeRef.current[jobId];
                navigate(`/results/${jobId}`, {
                  state: {
                    file: jobFileMapRef.current[jobId] ?? null,
                    elapsedMs: start ? Date.now() - start : null,
                    _fromUploadDone: { docStatuses },
                  },
                });
              }}
            />
          </div>
        )}

        {/* Bulk download — shown when ≥2 docs completed */}
        {phase === 'done' && docStatuses.filter((d) => d.status === 'completed').length >= 2 && (() => {
          const completedIds = docStatuses.filter((d) => d.status === 'completed').map((d) => d.jobId);
          return (
            <div className="card p-5 mb-6">
              <div className="flex items-center justify-between gap-4 flex-wrap">
                <div>
                  <p className="text-sm font-semibold text-gray-800">Download All Results</p>
                  <p className="text-xs text-gray-500 mt-0.5">
                    {completedIds.length} documents combined into one file
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <BulkDownloadButton jobIds={completedIds} format="excel" label="📗 Excel Report" />
                  <BulkDownloadButton jobIds={completedIds} format="word" label="📝 Word Report" />
                </div>
              </div>
            </div>
          );
        })()}

        {/* "Process more files" button after multi-file run completes */}
        {phase === 'done' && (
          <div className="flex justify-center mt-4">
            <button
              onClick={handleReset}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-white border border-gray-200 text-sm font-medium text-gray-600 hover:bg-gray-50 hover:border-gray-300 transition-colors shadow-sm"
            >
              <RefreshCw size={14} />
              Process more files
            </button>
          </div>
        )}
      </div>
    </main>
  );
}
