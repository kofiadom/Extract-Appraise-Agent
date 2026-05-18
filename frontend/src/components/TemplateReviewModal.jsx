import { useState } from 'react';
import { X, ChevronDown, ChevronUp, Save, Loader2, Plus, Trash2 } from 'lucide-react';
import { saveTemplate, updateTemplate } from '../services/api.js';

function EditableFieldCard({ item, index, onChange, onRemove }) {
  return (
    <div className="rounded-lg border border-gray-200 bg-white px-4 py-3 space-y-2">
      <div className="flex items-center gap-2">
        <span className="w-5 h-5 rounded-full bg-[#1B2A4A] text-white text-xs font-bold flex items-center justify-center flex-shrink-0">
          {index + 1}
        </span>
        <input
          value={item.name || ''}
          onChange={(e) => onChange({ ...item, name: e.target.value })}
          className="flex-1 text-sm font-semibold text-gray-800 bg-transparent border-b border-transparent hover:border-gray-300 focus:border-blue-400 focus:outline-none py-0.5"
          placeholder="Field name"
        />
        <button
          onClick={onRemove}
          className="p-1 text-gray-300 hover:text-red-500 rounded transition-colors"
        >
          <Trash2 size={12} />
        </button>
      </div>
      <textarea
        value={item.description || ''}
        onChange={(e) => onChange({ ...item, description: e.target.value })}
        rows={2}
        className="w-full text-xs text-gray-600 border border-gray-100 rounded-md px-2 py-1.5 focus:outline-none focus:border-blue-300 focus:ring-1 focus:ring-blue-100 resize-none placeholder-gray-300"
        placeholder="Description"
      />
      <textarea
        value={item.instructions || ''}
        onChange={(e) => onChange({ ...item, instructions: e.target.value })}
        rows={2}
        className="w-full text-xs text-gray-500 border border-gray-100 rounded-md px-2 py-1.5 focus:outline-none focus:border-blue-300 focus:ring-1 focus:ring-blue-100 resize-none placeholder-gray-300"
        placeholder="Extraction instructions (rules)"
      />
    </div>
  );
}

function EditableCriterionCard({ item, index, onChange, onRemove }) {
  return (
    <div className="rounded-lg border border-gray-200 bg-white px-4 py-3 space-y-2">
      <div className="flex items-start gap-2">
        <span className="w-5 h-5 rounded-full bg-[#1B2A4A] text-white text-xs font-bold flex items-center justify-center flex-shrink-0 mt-1">
          {index + 1}
        </span>
        <div className="flex-1 min-w-0 space-y-2">
          <div className="flex items-center gap-2">
            <input
              value={item.name || ''}
              onChange={(e) => onChange({ ...item, name: e.target.value })}
              className="flex-1 text-sm font-semibold text-gray-800 bg-transparent border-b border-transparent hover:border-gray-300 focus:border-blue-400 focus:outline-none py-0.5"
              placeholder="Criterion name"
            />
            <button
              onClick={onRemove}
              className="p-1 text-gray-300 hover:text-red-500 rounded transition-colors flex-shrink-0"
            >
              <Trash2 size={12} />
            </button>
          </div>
          <textarea
            value={item.description || ''}
            onChange={(e) => onChange({ ...item, description: e.target.value })}
            rows={2}
            className="w-full text-xs text-gray-600 border border-gray-100 rounded-md px-2 py-1.5 focus:outline-none focus:border-blue-300 focus:ring-1 focus:ring-blue-100 resize-none placeholder-gray-300"
            placeholder="Criterion question / description"
          />
          <div className="flex items-center gap-2">
            <span className="text-[11px] text-gray-400 flex-shrink-0">Applies to:</span>
            <input
              value={(item.applicability ?? []).join(', ')}
              onChange={(e) => {
                const tags = e.target.value
                  .split(',')
                  .map((s) => s.trim().toUpperCase())
                  .filter(Boolean);
                onChange({ ...item, applicability: tags });
              }}
              className="flex-1 text-xs text-gray-600 border border-gray-100 rounded px-2 py-1 focus:outline-none focus:border-blue-300"
              placeholder="ALL, SYNTHESIS, COHORT, QUALITATIVE"
            />
          </div>
        </div>
      </div>
    </div>
  );
}

function EditableSection({ title, count, children, onAdd, addLabel }) {
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
        {open ? (
          <ChevronUp size={15} className="text-gray-400" />
        ) : (
          <ChevronDown size={15} className="text-gray-400" />
        )}
      </button>
      {open && (
        <div className="px-5 py-4 space-y-2">
          {children}
          <button
            onClick={onAdd}
            className="w-full flex items-center justify-center gap-1.5 py-2 rounded-lg border border-dashed border-gray-200 text-xs text-gray-400 hover:border-blue-300 hover:text-blue-500 hover:bg-blue-50 transition-colors mt-1"
          >
            <Plus size={12} />
            {addLabel}
          </button>
        </div>
      )}
    </div>
  );
}

export default function TemplateReviewModal({
  parsed,
  sourceFiles,
  templateId,
  initialName,
  onApproved,
  onCancel,
}) {
  const isEditing = !!templateId;

  const [templateName, setTemplateName] = useState(initialName || 'My Template');
  const [fields, setFields] = useState(() =>
    JSON.parse(JSON.stringify(parsed?.extraction?.fields ?? [])),
  );
  const [criteria, setCriteria] = useState(() =>
    JSON.parse(JSON.stringify(parsed?.appraisal?.criteria ?? [])),
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  function updateField(index, value) {
    setFields((prev) => prev.map((f, i) => (i === index ? value : f)));
  }
  function removeField(index) {
    setFields((prev) => prev.filter((_, i) => i !== index));
  }
  function addField() {
    setFields((prev) => [...prev, { name: '', description: '', instructions: '', required: true }]);
  }

  function updateCriterion(index, value) {
    setCriteria((prev) => prev.map((c, i) => (i === index ? value : c)));
  }
  function removeCriterion(index) {
    setCriteria((prev) => prev.filter((_, i) => i !== index));
  }
  function addCriterion() {
    setCriteria((prev) => [
      ...prev,
      { name: '', description: '', applicability: ['ALL'], rating_scale: ['Yes', 'Partial', 'No', 'N/A'], instructions: '' },
    ]);
  }

  async function handleSave() {
    setSaving(true);
    setError('');
    const extraction = { fields };
    const appraisal = { criteria };
    try {
      const saved = isEditing
        ? await updateTemplate(templateId, templateName, extraction, appraisal)
        : await saveTemplate(templateName, extraction, appraisal, sourceFiles ?? {});
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
            <p className="text-base font-bold text-gray-900">
              {isEditing ? 'Edit Template' : 'Review Custom Template'}
            </p>
            <p className="text-xs text-gray-500 mt-0.5">
              {isEditing
                ? 'Modify fields and criteria, then save changes'
                : 'Review and edit before approving'}
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
          <EditableSection
            title="Extraction Fields"
            count={fields.length}
            onAdd={addField}
            addLabel="Add field"
          >
            {fields.map((f, i) => (
              <EditableFieldCard
                key={i}
                item={f}
                index={i}
                onChange={(v) => updateField(i, v)}
                onRemove={() => removeField(i)}
              />
            ))}
          </EditableSection>

          <EditableSection
            title="Appraisal Criteria"
            count={criteria.length}
            onAdd={addCriterion}
            addLabel="Add criterion"
          >
            {criteria.map((c, i) => (
              <EditableCriterionCard
                key={i}
                item={c}
                index={i}
                onChange={(v) => updateCriterion(i, v)}
                onRemove={() => removeCriterion(i)}
              />
            ))}
          </EditableSection>
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
              onClick={handleSave}
              disabled={saving || !templateName.trim()}
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-[#1B2A4A] text-white text-sm font-medium
                hover:bg-[#243660] transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {saving ? (
                <>
                  <Loader2 size={14} className="animate-spin" /> Saving…
                </>
              ) : (
                <>
                  <Save size={14} /> {isEditing ? 'Save Changes' : 'Approve & Save'}
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
