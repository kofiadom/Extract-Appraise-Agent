import { useState } from 'react';
import { FileText, ChevronDown, ChevronUp, Pencil, RotateCcw } from 'lucide-react';
import TemplateUploadSection from './TemplateUploadSection.jsx';
import { DEFAULT_EXTRACTION_FIELDS, DEFAULT_APPRAISAL_CRITERIA } from '../constants/defaultTemplate.js';

function CollapsibleSection({ title, count, children }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="border border-gray-100 rounded-xl overflow-hidden">
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between px-4 py-3 bg-gray-50 hover:bg-gray-100 transition-colors text-left"
      >
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-gray-700">{title}</span>
          <span className="px-2 py-0.5 rounded-full bg-gray-200 text-xs text-gray-500">{count}</span>
        </div>
        {open ? <ChevronUp size={14} className="text-gray-400" /> : <ChevronDown size={14} className="text-gray-400" />}
      </button>
      {open && (
        <div className="px-4 py-3 space-y-2 max-h-64 overflow-y-auto">
          {children}
        </div>
      )}
    </div>
  );
}

export default function TemplateSelectorStep({
  mode,
  onModeChange,
  activeTemplate,
  onParsed,
  onError,
  onLoadSaved,
  onEditTemplate,
  onContinue,
}) {
  return (
    <div className="card p-6">
      <div className="mb-5">
        <h2 className="text-sm font-semibold text-gray-700 mb-1">Extraction & Appraisal Template</h2>
        <p className="text-xs text-gray-400">
          Choose which guidelines the AI will use when processing research papers.
        </p>
      </div>

      {/* Segmented control */}
      <div className="flex rounded-xl bg-gray-100 p-1 mb-5">
        {['default', 'custom'].map((m) => (
          <button
            key={m}
            onClick={() => onModeChange(m)}
            className={`flex-1 py-2 rounded-lg text-xs font-semibold transition-all ${
              mode === m
                ? 'bg-white text-gray-800 shadow-sm'
                : 'text-gray-400 hover:text-gray-600'
            }`}
          >
            {m === 'default' ? 'Default Template' : 'Custom Template'}
          </button>
        ))}
      </div>

      {/* Default mode */}
      {mode === 'default' && (
        <div className="space-y-2 mb-5">
          <p className="text-xs text-gray-500 mb-3">
            Standard REST guidelines will be applied for extraction and appraisal:
          </p>
          <CollapsibleSection title="Extraction Fields" count={DEFAULT_EXTRACTION_FIELDS.length}>
            {DEFAULT_EXTRACTION_FIELDS.map((f, i) => (
              <div key={i} className="flex items-start gap-2.5 py-0.5">
                <span className="w-4 h-4 rounded-full bg-gray-200 text-gray-500 text-[10px] font-bold flex items-center justify-center flex-shrink-0 mt-0.5">
                  {i + 1}
                </span>
                <div>
                  <p className="text-xs font-medium text-gray-700">{f.name}</p>
                  <p className="text-[11px] text-gray-400 leading-tight">{f.description}</p>
                </div>
              </div>
            ))}
          </CollapsibleSection>
          <CollapsibleSection title="Appraisal Criteria" count={DEFAULT_APPRAISAL_CRITERIA.length}>
            {DEFAULT_APPRAISAL_CRITERIA.map((c, i) => (
              <div key={i} className="flex items-start gap-2.5 py-0.5">
                <span className="w-4 h-4 rounded-full bg-gray-200 text-gray-500 text-[10px] font-bold flex items-center justify-center flex-shrink-0 mt-0.5">
                  {i + 1}
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-[11px] text-gray-500 leading-tight">
                    {c.description.length > 90 ? `${c.description.substring(0, 90)}…` : c.description}
                  </p>
                  <div className="flex items-center gap-1 mt-0.5 flex-wrap">
                    {c.applicability.map((tag) => (
                      <span key={tag} className="px-1 py-0.5 rounded text-[10px] bg-blue-50 text-blue-500">
                        {tag}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            ))}
          </CollapsibleSection>
        </div>
      )}

      {/* Custom mode */}
      {mode === 'custom' && (
        <div className="mb-5">
          {activeTemplate ? (
            <div className="flex items-center gap-2 px-3 py-2.5 rounded-xl bg-green-50 border border-green-200">
              <FileText size={13} className="text-green-600 flex-shrink-0" />
              <p className="text-xs font-semibold text-green-800 flex-1 truncate">{activeTemplate.name}</p>
              <button
                onClick={() => onEditTemplate(activeTemplate)}
                className="flex-shrink-0 flex items-center gap-1 px-2 py-1 text-xs text-green-700 hover:bg-green-100 rounded-lg transition-colors"
              >
                <Pencil size={11} />
                Edit
              </button>
              <button
                onClick={onLoadSaved}
                className="flex-shrink-0 flex items-center gap-1 px-2 py-1 text-xs text-gray-500 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <RotateCcw size={11} />
                Change
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-xs text-gray-500">
                  Upload your template documents (PDF, Word, Excel, CSV).
                </p>
                <button
                  onClick={onLoadSaved}
                  className="text-xs text-blue-600 hover:underline font-medium"
                >
                  Load saved
                </button>
              </div>
              <TemplateUploadSection onParsed={onParsed} onError={onError} />
            </div>
          )}
        </div>
      )}

      {/* Continue button */}
      <button
        onClick={onContinue}
        disabled={mode === 'custom' && !activeTemplate}
        className="w-full py-2.5 rounded-xl bg-[#1B2A4A] text-white text-sm font-semibold
          hover:bg-[#243660] transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
      >
        Continue to Upload
      </button>
      {mode === 'custom' && !activeTemplate && (
        <p className="text-center text-[11px] text-gray-400 mt-2">
          Select or upload a template to continue
        </p>
      )}
    </div>
  );
}
