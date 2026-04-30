import { useState, useEffect, useCallback } from 'react';
import { X, Clock, FileText, Loader2, ChevronDown, BookOpen } from 'lucide-react';
import { listJobs, getJobResultById, sumMetrics } from '../services/api.js';

const LIMIT = 15;

const STATUS_FILTERS = [
  { id: undefined, label: 'All' },
  { id: 'completed', label: 'Completed' },
  { id: 'failed', label: 'Failed' },
];

export default function HistoryDrawer({ open, onClose, onLoadResult }) {
  const [filter, setFilter] = useState(undefined);
  const [jobs, setJobs] = useState([]);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [loadingJobId, setLoadingJobId] = useState(null);
  const [error, setError] = useState(null);

  const fetchJobs = useCallback(async (statusFilter, newOffset, append = false) => {
    if (append) setLoadingMore(true);
    else setLoading(true);
    setError(null);
    try {
      const result = await listJobs({ limit: LIMIT, offset: newOffset, status: statusFilter });
      setJobs((prev) => (append ? [...prev, ...result.jobs] : result.jobs));
      setTotal(result.total);
    } catch {
      setError('Failed to load history. Please try again.');
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    setOffset(0);
    setJobs([]);
    fetchJobs(filter, 0);
  }, [open, filter, fetchJobs]);

  function handleFilterChange(id) {
    setFilter(id);
    setOffset(0);
    setJobs([]);
  }

  function handleLoadMore() {
    const next = offset + LIMIT;
    setOffset(next);
    fetchJobs(filter, next, true);
  }

  async function handleView(job) {
    setLoadingJobId(job.id);
    try {
      const raw = await getJobResultById(job.id);
      const metrics = sumMetrics(raw);
      onLoadResult({ metrics, jobId: job.id, raw });
      onClose();
    } catch {
      // leave drawer open so user sees the job list still
    } finally {
      setLoadingJobId(null);
    }
  }

  return (
    <>
      {/* Backdrop */}
      <div
        className={`fixed inset-0 z-[49] bg-black/40 transition-opacity duration-300 ${
          open ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
        }`}
        onClick={onClose}
      />

      {/* Panel */}
      <div
        className={`fixed left-0 top-0 h-full z-50 flex flex-col bg-white shadow-2xl transition-transform duration-300 ${
          open ? 'translate-x-0' : '-translate-x-full'
        }`}
        style={{ width: 'min(480px, 92vw)' }}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between px-6 py-4 border-b border-white/10 flex-shrink-0"
          style={{ background: '#1B2A4A' }}
        >
          <div className="flex items-center gap-3">
            <Clock size={16} className="text-white/70" />
            <h2 className="text-white font-semibold text-sm">Run History</h2>
          </div>
          <button
            onClick={onClose}
            className="text-white/50 hover:text-white transition-colors p-1 rounded"
          >
            <X size={16} />
          </button>
        </div>

        {/* Filter pills + count */}
        <div className="flex items-center gap-2 px-5 py-3 border-b border-gray-100 flex-shrink-0">
          {STATUS_FILTERS.map(({ id, label }) => (
            <button
              key={label}
              onClick={() => handleFilterChange(id)}
              className={`px-3 py-1 rounded-full text-xs font-medium transition-all duration-150 ${
                filter === id
                  ? 'bg-[#1B2A4A] text-white'
                  : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
              }`}
            >
              {label}
            </button>
          ))}
          {total > 0 && (
            <span className="ml-auto text-xs text-gray-400">{total} run{total !== 1 ? 's' : ''}</span>
          )}
        </div>

        {/* Job list */}
        <div className="flex-1 overflow-y-auto px-5 py-4">
          {loading ? (
            <div className="flex flex-col items-center justify-center h-40 gap-3">
              <Loader2 size={22} className="text-[#1B2A4A] animate-spin" />
              <p className="text-sm text-gray-400">Loading history…</p>
            </div>
          ) : error ? (
            <div className="flex flex-col items-center justify-center h-40 gap-3 text-center">
              <p className="text-sm text-red-500">{error}</p>
              <button
                onClick={() => fetchJobs(filter, 0)}
                className="text-xs text-[#1B2A4A] underline"
              >
                Retry
              </button>
            </div>
          ) : jobs.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-40 gap-3 text-center">
              <Clock size={28} className="text-gray-200" />
              <p className="text-sm font-medium text-gray-400">No runs yet</p>
              <p className="text-xs text-gray-300 max-w-[220px] leading-relaxed">
                Your extraction and appraisal history will appear here.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {jobs.map((job) => (
                <JobCard
                  key={job.id}
                  job={job}
                  onView={handleView}
                  isLoading={loadingJobId === job.id}
                />
              ))}

              {jobs.length < total && (
                <button
                  onClick={handleLoadMore}
                  disabled={loadingMore}
                  className="w-full py-2.5 flex items-center justify-center gap-2 text-sm text-gray-500 hover:text-gray-700 border border-gray-200 rounded-xl hover:bg-gray-50 transition-all disabled:opacity-50 mt-1"
                >
                  {loadingMore ? (
                    <Loader2 size={13} className="animate-spin" />
                  ) : (
                    <ChevronDown size={13} />
                  )}
                  Load more
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </>
  );
}

function JobCard({ job, onView, isLoading }) {
  const files = (job.inputData?.markdownFiles ?? []).map(formatFileName);
  const primary = files[0] ?? 'Unknown file';
  const extra = files.length - 1;

  return (
    <div className="border border-gray-100 rounded-xl p-4 hover:border-gray-200 hover:shadow-sm transition-all bg-white">
      {/* File name row */}
      <div className="flex items-start gap-2.5 mb-3">
        <FileText size={14} className="text-gray-400 flex-shrink-0 mt-0.5" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-gray-800 truncate" title={primary}>
            {primary}
          </p>
          {extra > 0 && (
            <p className="text-xs text-gray-400 mt-0.5">
              +{extra} more file{extra > 1 ? 's' : ''}
            </p>
          )}
        </div>
        <StatusBadge status={job.status} />
      </div>

      {/* Footer row */}
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs text-gray-400 flex-shrink-0">{relativeDate(job.createdAt)}</span>

        {job.status === 'completed' && (
          <button
            onClick={() => onView(job)}
            disabled={isLoading}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#1B2A4A] text-white text-xs font-medium hover:bg-[#243657] transition-colors disabled:opacity-60 flex-shrink-0"
          >
            {isLoading ? (
              <Loader2 size={11} className="animate-spin" />
            ) : (
              <BookOpen size={11} />
            )}
            View Results
          </button>
        )}

        {job.status === 'failed' && job.error && (
          <p className="text-xs text-red-400 truncate" title={job.error}>
            {job.error}
          </p>
        )}
      </div>
    </div>
  );
}

function StatusBadge({ status }) {
  const cfg = {
    completed: 'bg-green-50 text-green-700 border-green-200',
    failed:    'bg-red-50 text-red-600 border-red-200',
    active:    'bg-blue-50 text-blue-700 border-blue-200',
    queued:    'bg-gray-50 text-gray-500 border-gray-200',
    cancelled: 'bg-gray-50 text-gray-400 border-gray-200',
  };
  const labels = {
    completed: 'Completed',
    failed:    'Failed',
    active:    'Running',
    queued:    'Queued',
    cancelled: 'Cancelled',
  };
  return (
    <span
      className={`flex-shrink-0 text-xs font-medium px-2 py-0.5 rounded-full border ${cfg[status] ?? cfg.queued}`}
    >
      {labels[status] ?? status}
    </span>
  );
}

function formatFileName(path) {
  // Strip .md extension
  let name = path.replace(/\.md$/i, '');
  // Strip UUID prefix (36 chars + underscore) if present
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}_/i.test(name)) {
    name = name.slice(37);
  }
  return name || path;
}

function relativeDate(iso) {
  const diff = Date.now() - new Date(iso).getTime();
  const sec = Math.floor(diff / 1000);
  if (sec < 60) return 'just now';
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const days = Math.floor(hr / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString(undefined, {
    month: 'short', day: 'numeric', year: 'numeric',
  });
}
