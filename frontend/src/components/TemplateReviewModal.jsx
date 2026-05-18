import { useState } from 'react';
import { X, ChevronDown, ChevronUp, CheckCircle, Save, Loader2 } from 'lucide-react';
import { saveTemplate } from '../services/api.js';

function FieldCard({ item, index }) {
  return (
    <div className="rounded-lg border border-gray-100 bg-gray-50 px-4 py-3 space-y-1.5">
      <div className="flex items-center gap-2">
        <span className="w-5 h-5 rounded-full bg-[#1B2A4A] text-white text-xs font-bold flex items-center justify-center flex-shrink-0">
          {index + 1}
        </span>
        <p className="text-sm font-semibold text-gray-800">{item.name}</p>
        {item.required === false && (
          <span className="text-xs text-gray-400 font-normal">(optional)</span>
        )}
      </div>
      {item.description && (
        <p className="text-xs text-gray-600 leading-relaxed pl-7">{item.description}</p>
      )}
      {item.instructions && (
        <p className="text-xs text-gray-500 italic leading-relaxed pl-7">
          Rule: {item.instructions}
        </p>
      )}
    </div>
  );
}

function CriterionCard({ item, index }) {
  return (
    <div className="rounded-lg border border-gray-100 bg-gray-50 px-4 py-3 space-y-1.5">
      <div className="flex items-start gap-2">
        <span className="w-5 h-5 rounded-full bg-[#1B2A4A] text-white text-xs font-bold flex items-center justify-center flex-shrink-0 mt-0.5">
          {index + 1}
        </span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="text-sm font-semibold text-gray-800">{item.name}</p>
            {(item.applicability ?? []).map((tag) => (
              <span
                key={tag}
                className="px-1.5 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-700"
              >
                {tag}
              </span>
            ))}
          </div>
          {item.description && (
            <p className="text-xs text-gray-600 leading-relaxed mt-1">{item.description}</p>
          )}
          {item.instructions && (
            <p className="text-xs text-gray-500 italic leading-relaxed mt-0.5">
              How to rate: {item.instructions}
            </p>
          )}
          {item.rating_scale?.length > 0 && (
            <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
              {item.rating_scale.map((r) => (
                <span key={r} className="px-1.5 py-0.5 rounded text-xs bg-gray-200 text-gray-600">
                  {r}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Section({ title, count, children }) {
  const [open, setOpen] = useState(true);
  return (
    <div className="border border-gray-200 rounded-xl overflow-hidden">
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between px-5 py-3.5 bg-gray-50 hover:bg-gray-100 transition-colors"
      >
        <div className="flex items-center gap-2">
          <p className="text-sm font-semibold text-gray-800">{title}</p>
          <span className="px-2 py-0.5 rounded-full bg-gray-200 text-xs font-medium text-gray-600">
            {count}
          </span>
        </div>
        {open ? <ChevronUp size={15} className="text-gray-400" /> : <ChevronDown size={15} className="text-gray-400" />}
      </button>
      {open && <div className="px-5 py-4 space-y-2">{children}</div>}
    </div>
  );
}

export default function TemplateReviewModal({ parsed, sourceFiles, onApproved, onCancel }) {
  const [templateName, setTemplateName] = useState('My Template');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const fields = parsed?.extraction?.fields ?? [];
  const criteria = parsed?.appraisal?.criteria ?? [];

  async function handleApprove() {
    setSaving(true);
    setError('');
    try {
      const saved = await saveTemplate(
        templateName,
        parsed.extraction,
        parsed.appraisal,
        sourceFiles ?? {},
      );
      onApproved(saved);
    } catch (err) {
      setError(err?.response?.data?.message || err.message || 'Failed to save template');
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <div>
            <p className="text-base font-bold text-gray-900">Review Custom Template</p>
            <p className="text-xs text-gray-500 mt-0.5">
              Approve to use these guidelines for extraction and appraisal
            </p>
          </div>
          <button
            onClick={onCancel}
            className="w-8 h-8 rounded-lg hover:bg-gray-100 flex items-center justify-center transition-colors"
          >
            <X size={16} className="text-gray-500" />
          </button>
        </div>

        {/* Scrollable body */}
        <div className="overflow-y-auto flex-1 px-6 py-4 space-y-4">
          {fields.length > 0 && (
            <Section title="Extraction Fields" count={fields.length}>
              {fields.map((f, i) => <FieldCard key={i} item={f} index={i} />)}
            </Section>
          )}
          {criteria.length > 0 && (
            <Section title="Appraisal Criteria" count={criteria.length}>
              {criteria.map((c, i) => <CriterionCard key={i} item={c} index={i} />)}
            </Section>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-100 space-y-3">
          {error && (
            <p className="text-xs text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</p>
          )}
          <div className="flex items-center gap-3">
            <input
              type="text"
              value={templateName}
              onChange={(e) => setTemplateName(e.target.value)}
              placeholder="Template name…"
              className="flex-1 px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-300"
            />
            <button
              onClick={onCancel}
              className="px-4 py-2 rounded-lg border border-gray-200 text-sm font-medium text-gray-600 hover:bg-gray-50 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleApprove}
              disabled={saving || !templateName.trim()}
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-[#1B2A4A] text-white text-sm font-medium
                hover:bg-[#243660] transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {saving ? (
                <><Loader2 size={14} className="animate-spin" /> Saving…</>
              ) : (
                <><Save size={14} /> Approve & Save</>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
