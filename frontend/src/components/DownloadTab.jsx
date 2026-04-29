import React, { useState } from 'react';
import { Download, Loader2, CheckCircle, AlertCircle } from 'lucide-react';
import { downloadFile } from '../services/api.js';

function DownloadButton({ type, label, description, icon, jobId }) {
  const [state, setState] = useState('idle'); // idle | loading | success | error
  const [errorMsg, setErrorMsg] = useState('');

  async function handleDownload() {
    setState('loading');
    setErrorMsg('');
    try {
      await downloadFile(type, jobId);
      setState('success');
      setTimeout(() => setState('idle'), 3000);
    } catch (err) {
      setErrorMsg(err?.response?.data?.detail || err.message || 'Download failed');
      setState('error');
      setTimeout(() => setState('idle'), 5000);
    }
  }

  return (
    <div className="card p-5 flex items-start gap-4 hover:shadow-card-lg transition-shadow duration-200">
      <div className="flex-shrink-0 w-11 h-11 rounded-xl bg-[#1B2A4A]/5 flex items-center justify-center text-xl">
        {icon}
      </div>

      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-gray-800">{label}</p>
        <p className="text-xs text-gray-500 mt-0.5">{description}</p>
        {state === 'error' && errorMsg && (
          <div className="flex items-center gap-1.5 mt-2">
            <AlertCircle size={11} className="text-red-500 flex-shrink-0" />
            <p className="text-xs text-red-600">{errorMsg}</p>
          </div>
        )}
        {state === 'success' && (
          <div className="flex items-center gap-1.5 mt-2">
            <CheckCircle size={11} className="text-green-500 flex-shrink-0" />
            <p className="text-xs text-green-600">Download started!</p>
          </div>
        )}
      </div>

      <button
        onClick={handleDownload}
        disabled={state === 'loading' || !jobId}
        className={`flex-shrink-0 flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all duration-150 ${
          state === 'success'
            ? 'bg-green-50 text-green-700 border border-green-200'
            : state === 'error'
            ? 'bg-red-50 text-red-700 border border-red-200'
            : 'bg-[#1B2A4A] text-white hover:bg-[#152038] active:bg-[#0E1626] disabled:opacity-60 disabled:cursor-not-allowed'
        }`}
      >
        {state === 'loading' ? (
          <Loader2 size={14} className="animate-spin" />
        ) : state === 'success' ? (
          <CheckCircle size={14} />
        ) : (
          <Download size={14} />
        )}
        {state === 'loading' ? 'Downloading…' : state === 'success' ? 'Done!' : 'Download'}
      </button>
    </div>
  );
}

export default function DownloadTab({ jobId }) {
  const downloads = [
    {
      type: 'excel',
      label: 'Evidence Table (.xlsx)',
      description: 'Structured evidence data in Excel format, ready for analysis and reporting.',
      icon: '📗',
    },
    {
      type: 'docx',
      label: 'Quality Appraisal (.docx)',
      description: 'Full REST quality appraisal report in Word format with criteria ratings.',
      icon: '📝',
    },
    {
      type: 'json',
      label: 'Full Data (.json)',
      description: 'Complete raw extraction and appraisal data in JSON format for further processing.',
      icon: '📄',
    },
  ];

  return (
    <div className="space-y-3">
      <div className="mb-4">
        <p className="text-sm text-gray-600">
          Download the extracted evidence and quality appraisal results in your preferred format.
        </p>
      </div>
      {downloads.map((d) => (
        <DownloadButton key={d.type} {...d} jobId={jobId} />
      ))}
      <div className="mt-6 rounded-lg bg-blue-50 border border-blue-100 px-4 py-3">
        <p className="text-xs text-blue-700 font-medium mb-0.5">Note</p>
        <p className="text-xs text-blue-600 leading-relaxed">
          Downloads are generated from the most recently processed pipeline run. Use the Reset button
          in the sidebar to clear results and start a new extraction.
        </p>
      </div>
    </div>
  );
}
