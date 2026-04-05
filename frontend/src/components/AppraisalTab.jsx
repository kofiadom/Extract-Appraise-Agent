import { useState } from 'react';
import { ChevronDown, ChevronUp, Shield, ThumbsUp, AlertTriangle } from 'lucide-react';

function truncate(str, max = 120) {
  if (!str) return '—';
  return str.length > max ? str.slice(0, max) + '…' : str;
}

function RatingBadge({ rating }) {
  if (!rating) return <span className="badge-na">N/A</span>;
  const r = String(rating).toLowerCase().trim();

  if (r === 'yes') return <span className="badge-yes">Yes</span>;
  if (r === 'partial' || r === 'partially') return <span className="badge-partial">Partial</span>;
  if (r === 'no') return <span className="badge-no">No</span>;
  if (r === 'n/a' || r === 'na' || r === 'not applicable') return <span className="badge-na">N/A</span>;

  // fallback for unknown
  return (
    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-600">
      {rating}
    </span>
  );
}

function QualityBadge({ score }) {
  if (!score) return null;
  const s = String(score).toLowerCase().trim();
  if (s.includes('high')) return <span className="badge-high">High</span>;
  if (s.includes('moderate') || s.includes('medium')) return <span className="badge-moderate">Moderate</span>;
  if (s.includes('low')) return <span className="badge-low">Low</span>;
  return (
    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-gray-100 text-gray-600">
      {score}
    </span>
  );
}

function AppraisalCard({ appraisal, index }) {
  const [expanded, setExpanded] = useState(true);

  const ref =
    appraisal.reference ||
    appraisal.citation ||
    appraisal.paper_reference ||
    appraisal.title ||
    `Paper ${index + 1}`;
  const quality = appraisal.overall_quality || appraisal.quality_score || appraisal.quality || '';
  const studyType = appraisal.study_type || appraisal.study_design || '';
  const score = appraisal.score || appraisal.total_score || '';
  const ratingLabel = appraisal.rating || appraisal.overall_rating || '';
  const criteria = appraisal.criteria || appraisal.appraisal_criteria || [];
  const strengths = Array.isArray(appraisal.strengths)
    ? appraisal.strengths
    : appraisal.strengths ? [appraisal.strengths] : [];
  const limitations = Array.isArray(appraisal.limitations)
    ? appraisal.limitations
    : appraisal.limitations ? [appraisal.limitations] : [];

  return (
    <div className="card overflow-hidden">
      {/* Header */}
      <div className="px-5 py-4 flex items-start justify-between gap-3 border-b border-gray-50">
        <div className="flex items-start gap-3 min-w-0">
          <span className="flex-shrink-0 w-6 h-6 rounded-full bg-[#1B2A4A] text-white text-xs font-bold flex items-center justify-center mt-0.5">
            {index + 1}
          </span>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-gray-800 leading-snug line-clamp-2">
              {truncate(ref, 160)}
            </p>
            <div className="flex items-center gap-2 mt-1.5 flex-wrap">
              {studyType && (
                <span className="text-xs text-gray-500 bg-gray-100 px-2 py-0.5 rounded-md font-medium">
                  {studyType}
                </span>
              )}
              {score !== '' && score !== null && score !== undefined && (
                <span className="text-xs text-gray-500">
                  Score: <span className="font-semibold text-gray-700">{score}</span>
                </span>
              )}
              <QualityBadge score={quality || ratingLabel} />
            </div>
          </div>
        </div>
        <button
          onClick={() => setExpanded((e) => !e)}
          className="flex-shrink-0 w-7 h-7 rounded-lg bg-gray-50 hover:bg-gray-100 flex items-center justify-center transition-colors mt-0.5"
        >
          {expanded ? (
            <ChevronUp size={14} className="text-gray-400" />
          ) : (
            <ChevronDown size={14} className="text-gray-400" />
          )}
        </button>
      </div>

      {expanded && (
        <div className="px-5 py-4 space-y-5">
          {/* Criteria table */}
          {Array.isArray(criteria) && criteria.length > 0 && (
            <div>
              <div className="flex items-center gap-1.5 mb-3">
                <Shield size={12} className="text-gray-400" />
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
                  Appraisal Criteria
                </p>
              </div>
              <div className="rounded-lg border border-gray-100 overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-gray-50 border-b border-gray-100">
                      <th className="py-2.5 px-3 text-left text-xs font-semibold text-gray-500 w-8">#</th>
                      <th className="py-2.5 px-3 text-left text-xs font-semibold text-gray-500">Criterion</th>
                      <th className="py-2.5 px-3 text-left text-xs font-semibold text-gray-500 w-28">Rating</th>
                      <th className="py-2.5 px-3 text-left text-xs font-semibold text-gray-500">Justification</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {criteria.map((c, i) => {
                      const criterion =
                        c.criterion || c.name || c.question || c.item || `Criterion ${i + 1}`;
                      const rating = c.rating || c.score || c.response || '';
                      const justification = c.justification || c.explanation || c.notes || '';
                      return (
                        <tr key={i} className="hover:bg-gray-50/50 transition-colors">
                          <td className="py-2.5 px-3 text-xs text-gray-400 align-top">{i + 1}</td>
                          <td className="py-2.5 px-3 text-xs text-gray-700 align-top leading-relaxed">
                            {truncate(criterion, 100)}
                          </td>
                          <td className="py-2.5 px-3 align-top">
                            <RatingBadge rating={rating} />
                          </td>
                          <td className="py-2.5 px-3 text-xs text-gray-600 align-top leading-relaxed">
                            {truncate(justification, 200)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Strengths + Limitations */}
          {(strengths.length > 0 || limitations.length > 0) && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {strengths.length > 0 && (
                <div className="rounded-lg border-l-4 border-green-400 bg-green-50/50 px-4 py-3">
                  <div className="flex items-center gap-1.5 mb-2">
                    <ThumbsUp size={12} className="text-green-600" />
                    <p className="text-xs font-semibold text-green-700 uppercase tracking-wider">
                      Strengths
                    </p>
                  </div>
                  <ul className="space-y-1.5">
                    {strengths.map((s, i) => (
                      <li key={i} className="flex items-start gap-2">
                        <span className="text-green-400 text-xs mt-0.5 flex-shrink-0">•</span>
                        <p className="text-xs text-green-900 leading-relaxed">{s}</p>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {limitations.length > 0 && (
                <div className="rounded-lg border-l-4 border-amber-400 bg-amber-50/50 px-4 py-3">
                  <div className="flex items-center gap-1.5 mb-2">
                    <AlertTriangle size={12} className="text-amber-600" />
                    <p className="text-xs font-semibold text-amber-700 uppercase tracking-wider">
                      Limitations
                    </p>
                  </div>
                  <ul className="space-y-1.5">
                    {limitations.map((l, i) => (
                      <li key={i} className="flex items-start gap-2">
                        <span className="text-amber-400 text-xs mt-0.5 flex-shrink-0">•</span>
                        <p className="text-xs text-amber-900 leading-relaxed">{l}</p>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}

          {/* Render extra plain string fields */}
          {renderExtraAppraisalFields(appraisal)}
        </div>
      )}
    </div>
  );
}

const KNOWN_APPRAISAL_KEYS = new Set([
  'reference', 'citation', 'paper_reference', 'title', 'overall_quality', 'quality_score',
  'quality', 'study_type', 'study_design', 'score', 'total_score', 'rating', 'overall_rating',
  'criteria', 'appraisal_criteria', 'strengths', 'limitations',
]);

function renderExtraAppraisalFields(appraisal) {
  const extras = Object.entries(appraisal).filter(
    ([k, v]) =>
      !KNOWN_APPRAISAL_KEYS.has(k) &&
      (typeof v === 'string' || typeof v === 'number') &&
      v !== '' &&
      v !== null &&
      v !== undefined
  );
  if (!extras.length) return null;
  return (
    <div className="pt-1 border-t border-gray-50 grid grid-cols-2 gap-x-4 gap-y-3">
      {extras.map(([key, val]) => (
        <div key={key} className="min-w-0">
          <p className="text-xs text-gray-400 font-medium uppercase tracking-wider mb-1">
            {key.replace(/_/g, ' ')}
          </p>
          <p className="text-sm text-gray-800">{typeof val === 'number' ? String(val) : val}</p>
        </div>
      ))}
    </div>
  );
}

export default function AppraisalTab({ appraisals }) {
  if (!appraisals || appraisals.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <div className="w-12 h-12 rounded-2xl bg-gray-100 flex items-center justify-center mb-3">
          <Shield size={20} className="text-gray-300" />
        </div>
        <p className="text-gray-400 text-sm">No appraisal data available</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between mb-2">
        <p className="text-xs text-gray-400 font-medium">
          {appraisals.length} paper{appraisals.length !== 1 ? 's' : ''} appraised
        </p>
      </div>
      {appraisals.map((a, i) => (
        <AppraisalCard key={i} appraisal={a} index={i} />
      ))}
    </div>
  );
}
