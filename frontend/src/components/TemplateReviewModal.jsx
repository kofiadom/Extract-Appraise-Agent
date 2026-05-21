import { useState } from 'react';
import { X, ChevronDown, ChevronUp, Save, Loader2, Plus, Trash2, Pencil, Check } from 'lucide-react';
import { saveTemplate, updateTemplate } from '../services/api.js';

// ── Read/edit field card ──────────────────────────────────────────────────────

function FieldCard({ item, index, isEditing, onEdit, onDone, onChange, onRemove }) {
  if (isEditing) {
    return (
      <div className="rounded-lg border border-blue-200 bg-blue-50/30 px-4 py-3 space-y-2">
        <div className="flex items-center gap-2">
          <span className="w-5 h-5 rounded-full bg-[#1B2A4A] text-white text-xs font-bold flex items-center justify-center flex-shrink-0">
            {index + 1}
          </span>
          <input
            autoFocus
            value={item.name || ''}
            onChange={(e) => onChange({ ...item, name: e.target.value })}
            className="flex-1 text-sm font-semibold text-gray-800 bg-transparent border-b border-blue-300 focus:outline-none py-0.5"
            placeholder="Field name"
          />
          <button onClick={onDone} title="Done" className="p-1 text-blue-500 hover:text-blue-700 rounded transition-colors">
            <Check size={13} />
          </button>
          <button onClick={onRemove} title="Remove" className="p-1 text-gray-300 hover:text-red-500 rounded transition-colors">
            <Trash2 size={12} />
          </button>
        </div>
        <textarea
          value={item.description || ''}
          onChange={(e) => onChange({ ...item, description: e.target.value })}
          rows={2}
          className="w-full text-xs text-gray-600 border border-gray-200 rounded-md px-2 py-1.5 focus:outline-none focus:border-blue-300 resize-none placeholder-gray-300"
          placeholder="Description"
        />
        <textarea
          value={item.instructions || ''}
          onChange={(e) => onChange({ ...item, instructions: e.target.value })}
          rows={2}
          className="w-full text-xs text-gray-500 border border-gray-200 rounded-md px-2 py-1.5 focus:outline-none focus:border-blue-300 resize-none placeholder-gray-300"
          placeholder="Extraction instructions (rules)"
        />
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-gray-100 bg-gray-50 px-4 py-3 space-y-1.5 group">
      <div className="flex items-center gap-2">
        <span className="w-5 h-5 rounded-full bg-[#1B2A4A] text-white text-xs font-bold flex items-center justify-center flex-shrink-0">
          {index + 1}
        </span>
        <p className="text-sm font-semibold text-gray-800 flex-1">
          {item.name || <span className="italic text-gray-400">Unnamed field</span>}
        </p>
        {item.required === false && (
          <span className="text-xs text-gray-400">(optional)</span>
        )}
        <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
          <button onClick={onEdit} title="Edit" className="p-1 text-gray-400 hover:text-blue-500 rounded transition-colors">
            <Pencil size={12} />
          </button>
          <button onClick={onRemove} title="Remove" className="p-1 text-gray-400 hover:text-red-500 rounded transition-colors">
            <Trash2 size={12} />
          </button>
        </div>
      </div>
      {item.description && (
        <p className="text-xs text-gray-600 leading-relaxed pl-7">{item.description}</p>
      )}
      {item.instructions && (
        <p className="text-xs text-gray-500 italic leading-relaxed pl-7">Rule: {item.instructions}</p>
      )}
    </div>
  );
}

// ── Read/edit criterion card ──────────────────────────────────────────────────

function CriterionCard({ item, index, isEditing, onEdit, onDone, onChange, onRemove }) {
  if (isEditing) {
    return (
      <div className="rounded-lg border border-blue-200 bg-blue-50/30 px-4 py-3 space-y-2">
        <div className="flex items-start gap-2">
          <span className="w-5 h-5 rounded-full bg-[#1B2A4A] text-white text-xs font-bold flex items-center justify-center flex-shrink-0 mt-1">
            {index + 1}
          </span>
          <div className="flex-1 min-w-0 space-y-2">
            <div className="flex items-center gap-2">
              <input
                autoFocus
                value={item.name || ''}
                onChange={(e) => onChange({ ...item, name: e.target.value })}
                className="flex-1 text-sm font-semibold text-gray-800 bg-transparent border-b border-blue-300 focus:outline-none py-0.5"
                placeholder="Criterion name"
              />
              <button onClick={onDone} title="Done" className="p-1 text-blue-500 hover:text-blue-700 rounded transition-colors flex-shrink-0">
                <Check size={13} />
              </button>
              <button onClick={onRemove} title="Remove" className="p-1 text-gray-300 hover:text-red-500 rounded transition-colors flex-shrink-0">
                <Trash2 size={12} />
              </button>
            </div>
            <textarea
              value={item.description || ''}
              onChange={(e) => onChange({ ...item, description: e.target.value })}
              rows={2}
              className="w-full text-xs text-gray-600 border border-gray-200 rounded-md px-2 py-1.5 focus:outline-none focus:border-blue-300 resize-none placeholder-gray-300"
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
                className="flex-1 text-xs text-gray-600 border border-gray-200 rounded px-2 py-1 focus:outline-none focus:border-blue-300"
                placeholder="ALL, SYNTHESIS, COHORT, QUALITATIVE"
              />
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-gray-100 bg-gray-50 px-4 py-3 space-y-1.5 group">
      <div className="flex items-start gap-2">
        <span className="w-5 h-5 rounded-full bg-[#1B2A4A] text-white text-xs font-bold flex items-center justify-center flex-shrink-0 mt-0.5">
          {index + 1}
        </span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="text-sm font-semibold text-gray-800">
              {item.name || <span className="italic text-gray-400">Unnamed criterion</span>}
            </p>
            {(item.applicability ?? []).map((tag) => (
              <span key={tag} className="px-1.5 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-700">
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
        <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
          <button onClick={onEdit} title="Edit" className="p-1 text-gray-400 hover:text-blue-500 rounded transition-colors">
            <Pencil size={12} />
          </button>
          <button onClick={onRemove} title="Remove" className="p-1 text-gray-400 hover:text-red-500 rounded transition-colors">
            <Trash2 size={12} />
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Collapsible section with add button ───────────────────────────────────────

function Section({ title, count, children, onAdd, addLabel }) {
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

// ── Modal ─────────────────────────────────────────────────────────────────────

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
  // Which card is currently in edit mode (-1 = none)
  const [editingFieldIdx, setEditingFieldIdx] = useState(-1);
  const [editingCriterionIdx, setEditingCriterionIdx] = useState(-1);

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  function updateField(index, value) {
    setFields((prev) => prev.map((f, i) => (i === index ? value : f)));
  }
  function removeField(index) {
    setFields((prev) => prev.filter((_, i) => i !== index));
    if (editingFieldIdx === index) setEditingFieldIdx(-1);
  }
  function addField() {
    const newIdx = fields.length;
    setFields((prev) => [...prev, { name: '', description: '', instructions: '', required: true }]);
    setEditingFieldIdx(newIdx);
  }

  function updateCriterion(index, value) {
    setCriteria((prev) => prev.map((c, i) => (i === index ? value : c)));
  }
  function removeCriterion(index) {
    setCriteria((prev) => prev.filter((_, i) => i !== index));
    if (editingCriterionIdx === index) setEditingCriterionIdx(-1);
  }
  function addCriterion() {
    const newIdx = criteria.length;
    setCriteria((prev) => [
      ...prev,
      { name: '', description: '', applicability: ['ALL'], rating_scale: ['Yes', 'Partial', 'No', 'N/A'], instructions: '' },
    ]);
    setEditingCriterionIdx(newIdx);
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
                ? 'Hover a card and click the pencil to edit it'
                : 'Review fields and criteria — hover any card to edit or remove it'}
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
          <Section
            title="Extraction Fields"
            count={fields.length}
            onAdd={addField}
            addLabel="Add field"
          >
            {fields.map((f, i) => (
              <FieldCard
                key={i}
                item={f}
                index={i}
                isEditing={editingFieldIdx === i}
                onEdit={() => setEditingFieldIdx(i)}
                onDone={() => setEditingFieldIdx(-1)}
                onChange={(v) => updateField(i, v)}
                onRemove={() => removeField(i)}
              />
            ))}
          </Section>

          <Section
            title="Appraisal Criteria"
            count={criteria.length}
            onAdd={addCriterion}
            addLabel="Add criterion"
          >
            {criteria.map((c, i) => (
              <CriterionCard
                key={i}
                item={c}
                index={i}
                isEditing={editingCriterionIdx === i}
                onEdit={() => setEditingCriterionIdx(i)}
                onDone={() => setEditingCriterionIdx(-1)}
                onChange={(v) => updateCriterion(i, v)}
                onRemove={() => removeCriterion(i)}
              />
            ))}
          </Section>
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
