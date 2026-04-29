import { useState } from 'react';
import { RotateCcw, BookOpen, AlertTriangle, ChevronLeft, ChevronRight, LogOut } from 'lucide-react';

export default function Sidebar({ onReset, onLogout, phase, isOpen, onToggle }) {
  const [showResetConfirm, setShowResetConfirm] = useState(false);

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
      className="fixed left-0 top-0 h-screen flex flex-col overflow-hidden transition-all duration-200"
      style={{ width: isOpen ? 260 : 48, background: '#1B2A4A', zIndex: 40 }}
    >
      {/* Toggle button */}
      <div
        className="flex items-center flex-shrink-0 border-b border-white/10"
        style={{ height: 56, minHeight: 56 }}
      >
        {isOpen && (
          <div className="flex items-center gap-3 px-5 flex-1 min-w-0">
            <div className="flex-shrink-0 w-7 h-7 rounded-lg bg-white/10 flex items-center justify-center">
              <BookOpen size={14} className="text-white" />
            </div>
            <div className="min-w-0">
              <p className="text-white font-semibold text-sm leading-tight truncate">REST Evidence</p>
              <p className="text-white/50 text-xs leading-tight">Extractor</p>
            </div>
          </div>
        )}
        <button
          onClick={onToggle}
          className="flex-shrink-0 w-12 h-full flex items-center justify-center text-white/40 hover:text-white hover:bg-white/10 transition-colors"
          title={isOpen ? 'Collapse sidebar' : 'Expand sidebar'}
        >
          {isOpen ? <ChevronLeft size={15} /> : <ChevronRight size={15} />}
        </button>
      </div>

      {/* Collapsed: icon strip */}
      {!isOpen && (
        <div className="flex flex-col items-center gap-4 pt-5">
          <div title={`Status: ${phase}`} className="w-7 h-7 rounded-lg bg-white/10 flex items-center justify-center">
            <StatusDot phase={phase} />
          </div>
          {canReset && (
            <button
              onClick={handleResetClick}
              title="Reset"
              className="w-7 h-7 rounded-lg bg-white/5 flex items-center justify-center text-white/40 hover:text-red-300 hover:bg-red-500/10 transition-colors"
            >
              <RotateCcw size={13} />
            </button>
          )}
        </div>
      )}

      {/* Expanded: full content */}
      {isOpen && (
        <>
          <p className="text-white/40 text-xs px-5 pt-3 pb-4 border-b border-white/10 leading-relaxed">
            AI-powered systematic review tool for evidence extraction and quality appraisal.
          </p>

          {/* Status */}
          <div className="px-5 py-5 border-b border-white/10">
            <p className="text-white/50 text-xs font-medium uppercase tracking-wider mb-3">Status</p>
            <StatusIndicator phase={phase} />
          </div>

          {/* Spacer */}
          <div className="flex-1" />

          {/* Reset */}
          <div className="px-5 pt-5 border-t border-white/10">
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
          </div>

          {/* Logout */}
          <div className="px-5 py-4">
            <button
              onClick={onLogout}
              className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-sm font-medium bg-white/5 text-white/50 hover:bg-white/10 hover:text-white border border-transparent transition-all duration-150"
            >
              <LogOut size={14} className="flex-shrink-0" />
              Sign Out
            </button>
          </div>

          {/* Footer */}
          <div className="px-5 pb-5">
            <p className="text-white/20 text-xs text-center">REST Evidence Extractor v1.0</p>
          </div>
        </>
      )}
    </aside>
  );
}

function StatusDot({ phase }) {
  const dots = {
    idle: 'bg-white/30',
    uploading: 'bg-blue-400 animate-pulse',
    uploaded: 'bg-green-400',
    running: 'bg-amber-400 animate-pulse',
    done: 'bg-green-400',
    error: 'bg-red-400',
  };
  return <span className={`w-2.5 h-2.5 rounded-full ${dots[phase] || dots.idle}`} />;
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
