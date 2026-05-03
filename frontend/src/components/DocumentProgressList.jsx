import { Loader2, CheckCircle2, XCircle, Clock, FileText } from 'lucide-react';

/**
 * docStatuses: array of {
 *   jobId: string,
 *   fileName: string,    // the markdown filename (e.g. "userid_paper.md")
 *   displayName: string, // pretty-printed name (no user prefix, no .md)
 *   status: 'queued' | 'active' | 'completed' | 'failed',
 *   progress: number,
 *   error?: string,
 * }
 */
export default function DocumentProgressList({ docStatuses }) {
  if (!docStatuses || docStatuses.length === 0) return null;

  const completedCount = docStatuses.filter((d) => d.status === 'completed').length;
  const failedCount = docStatuses.filter((d) => d.status === 'failed').length;
  const total = docStatuses.length;

  return (
    <div className="rounded-xl border border-amber-100 bg-amber-50 overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-3.5 border-b border-amber-100">
        <div className="flex items-center gap-2.5">
          <Loader2 size={15} className="text-amber-500 animate-spin flex-shrink-0" />
          <p className="text-sm font-semibold text-amber-800">Processing documents…</p>
        </div>
        <span className="text-xs font-medium text-amber-600 bg-amber-100 px-2.5 py-1 rounded-full">
          {completedCount + failedCount} / {total} done
        </span>
      </div>

      {/* Document rows */}
      <div className="divide-y divide-amber-100">
        {docStatuses.map((doc) => (
          <DocumentRow key={doc.jobId} doc={doc} />
        ))}
      </div>
    </div>
  );
}

function DocumentRow({ doc }) {
  const { displayName, status, progress, error } = doc;

  return (
    <div className="flex items-center gap-3 px-5 py-3">
      {/* File icon */}
      <div className="flex-shrink-0 w-8 h-8 rounded-lg bg-white border border-amber-100 flex items-center justify-center shadow-sm">
        <FileText size={14} className="text-amber-500" />
      </div>

      {/* Name + progress bar */}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-gray-800 truncate" title={displayName}>
          {displayName}
        </p>
        {/* Progress bar — only when active */}
        {status === 'active' && (
          <div className="mt-1.5 h-1.5 rounded-full bg-amber-200 overflow-hidden w-full">
            <div
              className="h-full rounded-full bg-amber-500 transition-all duration-700"
              style={{ width: `${progress ?? 10}%` }}
            />
          </div>
        )}
        {/* Error message */}
        {status === 'failed' && error && (
          <p className="text-xs text-red-500 mt-0.5 truncate" title={error}>{error}</p>
        )}
      </div>

      {/* Status indicator */}
      <StatusIcon status={status} />
    </div>
  );
}

function StatusIcon({ status }) {
  switch (status) {
    case 'completed':
      return <CheckCircle2 size={18} className="text-green-500 flex-shrink-0" />;
    case 'failed':
      return <XCircle size={18} className="text-red-400 flex-shrink-0" />;
    case 'active':
      return <Loader2 size={18} className="text-amber-500 animate-spin flex-shrink-0" />;
    case 'queued':
    default:
      return <Clock size={18} className="text-gray-300 flex-shrink-0" />;
  }
}
