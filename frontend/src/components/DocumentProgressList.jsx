import React from 'react';
import { FileText, Loader2, CheckCircle, XCircle, Clock } from 'lucide-react';

export default function DocumentProgressList({ jobStatuses }) {
  const getStatusIcon = (status) => {
    switch (status) {
      case 'queued':
        return <Clock size={16} className="text-gray-400" />;
      case 'running':
        return <Loader2 size={16} className="text-blue-500 animate-spin" />;
      case 'completed':
        return <CheckCircle size={16} className="text-green-500" />;
      case 'failed':
        return <XCircle size={16} className="text-red-500" />;
      default:
        return <Clock size={16} className="text-gray-400" />;
    }
  };

  const getStatusText = (status) => {
    switch (status) {
      case 'queued':
        return 'Queued';
      case 'running':
        return 'Processing';
      case 'completed':
        return 'Completed';
      case 'failed':
        return 'Failed';
      default:
        return 'Unknown';
    }
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'queued':
        return 'text-gray-600';
      case 'running':
        return 'text-blue-600';
      case 'completed':
        return 'text-green-600';
      case 'failed':
        return 'text-red-600';
      default:
        return 'text-gray-600';
    }
  };

  return (
    <div className="card p-6 mb-6">
      <h2 className="text-sm font-semibold text-gray-700 mb-4">Processing Documents</h2>
      <div className="space-y-3">
        {Object.entries(jobStatuses).map(([jobId, { status, name, error }]) => (
          <div key={jobId} className="flex items-center gap-3 p-3 rounded-lg bg-gray-50 border border-gray-100">
            <div className="flex-shrink-0">
              {getStatusIcon(status)}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <FileText size={14} className="text-gray-400 flex-shrink-0" />
                <p className="text-sm font-medium text-gray-900 truncate">{name}</p>
              </div>
              <p className={`text-xs ${getStatusColor(status)}`}>
                {getStatusText(status)}
                {error && ` — ${error}`}
              </p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}