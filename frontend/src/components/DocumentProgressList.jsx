import { Loader2, CheckCircle2, XCircle, Clock, FileText, ExternalLink } from 'lucide-react';

/**
 * docStatuses: array of {
 *   jobId: string,
 *   fileName: string,
 *   displayName: string,
 *   status: 'queued' | 'active' | 'completed' | 'failed',
 *   progress: number,
 *   error?: string,
 * }
 *
 * onViewResult?: (jobId: string) => void — called when user clicks "View Results"
 * allDone?: boolean — when true, replaces the spinner in the header with a checkmark
 */
export default function DocumentProgressList({ docStatuses, onViewResult, allDone }) {
  if (!docStatuses || docStatuses.length === 0) return null;

  const completedCount = docStatuses.filter((d) => d.status === 'completed').length;
  const failedCount    = docStatuses.filter((d) => d.status === 'failed').length;
  const total          = docStatuses.length;
  const isDone         = allDone || (completedCount + failedCount === total);

  return (
    <div className={`rounded-xl border overflow-hidden ${isDone ? 'border-green-100 bg-green-50' : 'border-amber-100 bg-amber-50'}`}>
      {/* Header */}
      <div className={`flex items-center justify-between px-5 py-3.5 border-b ${isDone ? 'border-green-100' : 'border-amber-100'}`}>
        <div className="flex items-center gap-2.5">
          {isDone ? (
            <CheckCircle2 size={15} className="text-green-500 flex-shrink-0" />
          ) : (
            <Loader2 size={15} className="text-amber-500 animate-spin flex-shrink-0" />
          )}
          <p className={`text-sm font-semibold ${isDone ? 'text-green-800' : 'text-amber-800'}`}>
            {isDone ? 'Processing complete' : 'Processing documents…'}
          </p>
        </div>
        <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${isDone ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-600'}`}>
          {completedCount + failedCount} / {total} done
        </span>
      </div>

      {/* Document rows */}
      <div className={`divide-y ${isDone ? 'divide-green-100' : 'divide-amber-100'}`}>
        {docStatuses.map((doc) => (
          <DocumentRow
            key={doc.jobId}
            doc={doc}
            onViewResult={onViewResult}
            isDonePhase={isDone}
          />
        ))}
      </div>
    </div>
  );
}

function DocumentRow({ doc, onViewResult, isDonePhase }) {
  const { jobId, displayName, status, progress, error } = doc;

  return (
    <div className="flex items-center gap-3 px-5 py-3">
      {/* File icon */}
      <div className={`flex-shrink-0 w-8 h-8 rounded-lg bg-white border flex items-center justify-center shadow-sm ${isDonePhase ? 'border-green-100' : 'border-amber-100'}`}>
        <FileText size={14} className={status === 'completed' ? 'text-green-500' : status === 'failed' ? 'text-red-400' : 'text-amber-500'} />
      </div>

      {/* Name + progress */}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-gray-800 truncate" title={displayName}>
          {displayName}
        </p>
        {status === 'active' && (
          <div className="mt-1.5 h-1.5 rounded-full bg-amber-200 overflow-hidden w-full">
            <div
              className="h-full rounded-full bg-amber-500 transition-all duration-700"
              style={{ width: `${progress ?? 10}%` }}
            />
          </div>
        )}
        {status === 'failed' && error && (
          <p className="text-xs text-red-500 mt-0.5 truncate" title={error}>{error}</p>
        )}
      </div>

      {/* Status + View Results button */}
      <div className="flex items-center gap-2 flex-shrink-0">
        {status === 'completed' && onViewResult && (
          <button
            onClick={() => onViewResult(jobId)}
            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-[#1B2A4A] text-white text-xs font-medium hover:bg-[#243657] transition-colors"
          >
            View Results
            <ExternalLink size={11} />
          </button>
        )}
        <StatusIcon status={status} />
      </div>
    </div>
  );
}

function StatusIcon({ status }) {
  switch (status) {
    case 'completed': return <CheckCircle2 size={18} className="text-green-500" />;
    case 'failed':    return <XCircle size={18} className="text-red-400" />;
    case 'active':    return <Loader2 size={18} className="text-amber-500 animate-spin" />;
    default:          return <Clock size={18} className="text-gray-300" />;
  }
}
