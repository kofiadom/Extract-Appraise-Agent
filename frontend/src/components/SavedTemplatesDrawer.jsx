import { useEffect, useState } from 'react';
import { X, Trash2, CheckCircle, Loader2, FileText } from 'lucide-react';
import { listTemplates, getTemplate, deleteTemplate } from '../services/api.js';

export default function SavedTemplatesDrawer({ onSelect, onClose }) {
  const [templates, setTemplates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadingId, setLoadingId] = useState(null);
  const [deletingId, setDeletingId] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    listTemplates()
      .then(setTemplates)
      .catch(() => setError('Failed to load templates'))
      .finally(() => setLoading(false));
  }, []);

  async function handleSelect(id) {
    setLoadingId(id);
    try {
      const full = await getTemplate(id);
      onSelect(full);
    } catch {
      setError('Failed to load template');
    } finally {
      setLoadingId(null);
    }
  }

  async function handleDelete(e, id) {
    e.stopPropagation();
    setDeletingId(id);
    try {
      await deleteTemplate(id);
      setTemplates((prev) => prev.filter((t) => t.id !== id));
    } catch {
      setError('Failed to delete template');
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/30" onClick={onClose}>
      <div
        className="bg-white h-full w-full max-w-sm shadow-2xl flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <p className="text-sm font-bold text-gray-900">Saved Templates</p>
          <button onClick={onClose} className="w-7 h-7 rounded-lg hover:bg-gray-100 flex items-center justify-center">
            <X size={15} className="text-gray-500" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2">
          {loading && (
            <div className="flex items-center justify-center py-10">
              <Loader2 size={20} className="animate-spin text-gray-400" />
            </div>
          )}
          {error && (
            <p className="text-xs text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</p>
          )}
          {!loading && templates.length === 0 && (
            <div className="flex flex-col items-center justify-center py-16 text-center gap-2">
              <FileText size={28} className="text-gray-200" />
              <p className="text-sm text-gray-400">No saved templates yet</p>
              <p className="text-xs text-gray-300">Upload and approve a template to save it here</p>
            </div>
          )}
          {templates.map((tpl) => (
            <button
              key={tpl.id}
              onClick={() => handleSelect(tpl.id)}
              disabled={!!loadingId || !!deletingId}
              className="w-full text-left rounded-xl border border-gray-100 bg-gray-50 hover:border-blue-200 hover:bg-blue-50
                px-4 py-3 transition-colors group disabled:opacity-60"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    {loadingId === tpl.id ? (
                      <Loader2 size={13} className="animate-spin text-blue-500 flex-shrink-0" />
                    ) : (
                      <CheckCircle size={13} className="text-gray-300 group-hover:text-blue-400 flex-shrink-0 transition-colors" />
                    )}
                    <p className="text-sm font-semibold text-gray-800 truncate">{tpl.name}</p>
                  </div>
                  <p className="text-xs text-gray-400 mt-1 pl-5">
                    {new Date(tpl.createdAt).toLocaleDateString()}
                    {tpl.sourceFiles?.extraction && (
                      <span className="ml-2 text-gray-300">· {tpl.sourceFiles.extraction}</span>
                    )}
                  </p>
                </div>
                <button
                  onClick={(e) => handleDelete(e, tpl.id)}
                  disabled={deletingId === tpl.id}
                  className="flex-shrink-0 p-1 rounded-lg text-gray-300 hover:text-red-500 hover:bg-red-50 transition-colors"
                >
                  {deletingId === tpl.id ? (
                    <Loader2 size={13} className="animate-spin" />
                  ) : (
                    <Trash2 size={13} />
                  )}
                </button>
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
