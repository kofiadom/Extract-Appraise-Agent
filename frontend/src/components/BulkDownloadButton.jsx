import { useState } from 'react';
import { Download, Loader2, CheckCircle, AlertCircle } from 'lucide-react';
import { bulkDownload } from '../services/api.js';

/**
 * Single-format bulk download button.
 * Props:
 *   jobIds  – array of completed job IDs to combine
 *   format  – 'excel' | 'word'
 *   label   – button text
 *   variant – 'primary' (default) | 'outline'
 */
export default function BulkDownloadButton({ jobIds, format, label, variant = 'primary' }) {
  const [state, setState] = useState('idle');

  async function handleClick() {
    if (state === 'loading' || !jobIds.length) return;
    setState('loading');
    try {
      await bulkDownload(jobIds, format);
      setState('success');
      setTimeout(() => setState('idle'), 3000);
    } catch {
      setState('error');
      setTimeout(() => setState('idle'), 4000);
    }
  }

  const base = 'flex items-center gap-2 px-3.5 py-2 rounded-lg text-sm font-medium transition-all duration-150 disabled:opacity-50 disabled:cursor-not-allowed';

  const colors = {
    idle: variant === 'outline'
      ? 'bg-white text-gray-700 border border-gray-200 hover:bg-gray-50 hover:border-gray-300'
      : 'bg-[#1B2A4A] text-white hover:bg-[#243657]',
    loading: variant === 'outline'
      ? 'bg-white text-gray-500 border border-gray-200'
      : 'bg-[#1B2A4A]/80 text-white',
    success: 'bg-green-50 text-green-700 border border-green-200',
    error:   'bg-red-50 text-red-700 border border-red-200',
  };

  const icon = {
    idle:    <Download size={14} />,
    loading: <Loader2 size={14} className="animate-spin" />,
    success: <CheckCircle size={14} />,
    error:   <AlertCircle size={14} />,
  };

  const text = {
    idle:    label,
    loading: 'Downloading…',
    success: 'Done!',
    error:   'Failed — retry',
  };

  return (
    <button
      onClick={handleClick}
      disabled={!jobIds.length || state === 'loading'}
      className={`${base} ${colors[state]}`}
    >
      {icon[state]}
      {text[state]}
    </button>
  );
}
