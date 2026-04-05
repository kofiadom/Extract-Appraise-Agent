import React, { useState } from 'react';
import { Settings, RotateCcw, BookOpen, AlertTriangle, CheckCircle } from 'lucide-react';

export default function Sidebar({ apiUrl, onApiUrlChange, onReset, phase }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(apiUrl);
  const [showResetConfirm, setShowResetConfirm] = useState(false);

  function handleSave() {
    const trimmed = draft.trim().replace(/\/$/, '');
    onApiUrlChange(trimmed || apiUrl);
    setEditing(false);
  }

  function handleKeyDown(e) {
    if (e.key === 'Enter') handleSave();
    if (e.key === 'Escape') {
      setDraft(apiUrl);
      setEditing(false);
    }
  }

  function handleResetClick() {
    if (showResetConfirm) {
      onReset();
      setShowResetConfirm(false);
    } else {
      setShowResetConfirm(true);
      setTimeout(() => setShowResetConfirm(false), 3000);
    }
  }

  const canReset = phase !== 'idle' && phase !== 'uploading' && phase !== 'running';

  return (
    <aside
      className="fixed left-0 top-0 h-screen flex flex-col"
      style={{ width: 260, background: '#1B2A4A', zIndex: 40 }}
    >
      {/* Logo / Brand */}
      <div className="px-6 pt-7 pb-6 border-b border-white/10">
        <div className="flex items-center gap-3 mb-1">
          <div className="flex-shrink-0 w-8 h-8 rounded-lg bg-white/10 flex items-center justify-center">
            <BookOpen size={16} className="text-white" />
          </div>
          <div>
            <p className="text-white font-semibold text-sm leading-tight">REST Evidence</p>
            <p className="text-white/50 text-xs leading-tight">Extractor</p>
          </div>
        </div>
        <p className="text-white/40 text-xs mt-3 leading-relaxed">
          AI-powered systematic review tool for evidence extraction and quality appraisal.
        </p>
      </div>

      {/* API URL config */}
      <div className="px-5 py-5 border-b border-white/10">
        <div className="flex items-center gap-2 mb-2">
          <Settings size={12} className="text-white/40" />
          <p className="text-white/50 text-xs font-medium uppercase tracking-wider">API Endpoint</p>
        </div>
        {editing ? (
          <div className="space-y-2">
            <input
              type="text"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={handleKeyDown}
              autoFocus
              className="w-full px-3 py-2 rounded-lg bg-white/10 text-white text-xs border border-white/20 focus:outline-none focus:border-white/40 placeholder-white/30"
              placeholder="http://localhost:7777"
            />
            <div className="flex gap-2">
              <button
                onClick={handleSave}
                className="flex-1 py-1.5 rounded-md bg-white/20 text-white text-xs font-medium hover:bg-white/30 transition-colors"
              >
                Save
              </button>
              <button
                onClick={() => { setDraft(apiUrl); setEditing(false); }}
                className="flex-1 py-1.5 rounded-md bg-transparent text-white/50 text-xs font-medium hover:bg-white/10 transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <button
            onClick={() => { setDraft(apiUrl); setEditing(true); }}
            className="w-full text-left px-3 py-2 rounded-lg bg-white/5 hover:bg-white/10 transition-colors group"
          >
            <p className="text-white/70 text-xs font-mono truncate group-hover:text-white transition-colors">
              {apiUrl}
            </p>
            <p className="text-white/30 text-xs mt-0.5 group-hover:text-white/50 transition-colors">
              Click to edit
            </p>
          </button>
        )}
      </div>

      {/* Status */}
      <div className="px-5 py-5 border-b border-white/10">
        <div className="flex items-center gap-2 mb-3">
          <p className="text-white/50 text-xs font-medium uppercase tracking-wider">Status</p>
        </div>
        <StatusIndicator phase={phase} />
      </div>

      {/* Spacer */}
      <div className="flex-1" />

      {/* Reset */}
      <div className="px-5 py-5 border-t border-white/10">
        <button
          onClick={handleResetClick}
          disabled={!canReset}
          className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-150 ${
            showResetConfirm
              ? 'bg-red-500/20 text-red-300 border border-red-500/30'
              : canReset
              ? 'bg-white/5 text-white/60 hover:bg-red-500/10 hover:text-red-300 border border-transparent'
              : 'bg-white/5 text-white/20 border border-transparent cursor-not-allowed'
          }`}
        >
          {showResetConfirm ? (
            <AlertTriangle size={14} className="flex-shrink-0" />
          ) : (
            <RotateCcw size={14} className="flex-shrink-0" />
          )}
          {showResetConfirm ? 'Click again to confirm' : 'Reset & Clear Results'}
        </button>
        <p className="text-white/25 text-xs mt-2 text-center">
          Clears all data on backend and frontend
        </p>
      </div>

      {/* Footer */}
      <div className="px-5 pb-5">
        <p className="text-white/20 text-xs text-center">REST Evidence Extractor v1.0</p>
      </div>
    </aside>
  );
}

function StatusIndicator({ phase }) {
  const states = {
    idle: { label: 'Ready', color: 'text-white/40', dot: 'bg-white/20' },
    uploading: { label: 'Uploading files…', color: 'text-blue-300', dot: 'bg-blue-400 animate-pulse' },
    uploaded: { label: 'Files ready', color: 'text-green-300', dot: 'bg-green-400' },
    running: { label: 'Pipeline running…', color: 'text-amber-300', dot: 'bg-amber-400 animate-pulse' },
    done: { label: 'Complete', color: 'text-green-300', dot: 'bg-green-400' },
    error: { label: 'Error occurred', color: 'text-red-300', dot: 'bg-red-400' },
  };

  const s = states[phase] || states.idle;

  return (
    <div className="flex items-center gap-2.5">
      <span className={`w-2 h-2 rounded-full flex-shrink-0 ${s.dot}`} />
      <span className={`text-xs font-medium ${s.color}`}>{s.label}</span>
    </div>
  );
}
