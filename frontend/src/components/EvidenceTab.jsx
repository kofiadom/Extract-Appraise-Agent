import React, { useState } from 'react';
import { ChevronDown, ChevronUp, Globe, BookOpen, Users, MapPin, BarChart2, Plus } from 'lucide-react';

function truncate(str, max = 120) {
  if (!str) return '—';
  return str.length > max ? str.slice(0, max) + '…' : str;
}

function InfoChip({ label, value }) {
  if (!value) return null;
  return (
    <div className="min-w-0">
      <p className="text-xs text-gray-400 font-medium uppercase tracking-wider mb-1">{label}</p>
      <p className="text-sm text-gray-800 font-medium leading-snug">{value}</p>
    </div>
  );
}

function Section({ icon: Icon, title, children, className = '' }) {
  return (
    <div className={`space-y-1.5 ${className}`}>
      <div className="flex items-center gap-1.5">
        {Icon && <Icon size={12} className="text-gray-400" />}
        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">{title}</p>
      </div>
      {children}
    </div>
  );
}

function EvidenceCard({ paper, index }) {
  const [expanded, setExpanded] = useState(true);

  const ref = paper.reference || paper.citation || paper.title || `Paper ${index + 1}`;
  const country = paper.country || paper.setting_country || '';
  const studyType = paper.study_type || paper.study_design || '';
  const peerReviewed = paper.peer_reviewed;
  const intervention = paper.intervention || paper.intervention_description || '';
  const population = paper.population || paper.participants || '';
  const setting = paper.setting || paper.study_setting || '';
  const primaryResults = paper.primary_results || paper.main_findings || paper.results || '';
  const additionalFindings =
    paper.additional_findings || paper.secondary_findings || paper.other_findings || '';

  function peerReviewedLabel(val) {
    if (val === true || val === 'Yes' || val === 'yes') return 'Yes';
    if (val === false || val === 'No' || val === 'no') return 'No';
    if (val === null || val === undefined || val === '') return '—';
    return String(val);
  }

  return (
    <div className="card overflow-hidden">
      {/* Card header */}
      <div className="px-5 py-4 flex items-start justify-between gap-3 border-b border-gray-50">
        <div className="flex items-start gap-3 min-w-0">
          <span className="flex-shrink-0 w-6 h-6 rounded-full bg-[#1B2A4A] text-white text-xs font-bold flex items-center justify-center mt-0.5">
            {index + 1}
          </span>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-gray-800 leading-snug line-clamp-2">
              {truncate(ref, 160)}
            </p>
            {paper.year && (
              <p className="text-xs text-gray-400 mt-0.5">{paper.year}</p>
            )}
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
          {/* 4-column grid */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-4 gap-y-4">
            <div className="flex items-start gap-2 min-w-0">
              <Globe size={13} className="text-gray-300 flex-shrink-0 mt-0.5" />
              <InfoChip label="Country" value={country} />
            </div>
            <div className="flex items-start gap-2 min-w-0">
              <BookOpen size={13} className="text-gray-300 flex-shrink-0 mt-0.5" />
              <InfoChip label="Study Type" value={studyType} />
            </div>
            <div className="flex items-start gap-2 min-w-0">
              <div className="w-3 h-3 mt-0.5 flex-shrink-0" />
              <InfoChip
                label="Peer Reviewed"
                value={peerReviewedLabel(peerReviewed)}
              />
            </div>
            <div className="flex items-start gap-2 min-w-0">
              <div className="w-3 h-3 mt-0.5 flex-shrink-0" />
              <InfoChip label="Intervention" value={truncate(intervention, 80)} />
            </div>
          </div>

          {/* Population + Setting */}
          {(population || setting) && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-1 border-t border-gray-50">
              {population && (
                <Section icon={Users} title="Population">
                  <p className="text-sm text-gray-700 leading-relaxed">{population}</p>
                </Section>
              )}
              {setting && (
                <Section icon={MapPin} title="Setting">
                  <p className="text-sm text-gray-700 leading-relaxed">{setting}</p>
                </Section>
              )}
            </div>
          )}

          {/* Primary Results */}
          {primaryResults && (
            <div className="rounded-lg bg-green-50 border border-green-100 px-4 py-3">
              <div className="flex items-center gap-1.5 mb-2">
                <BarChart2 size={12} className="text-green-600" />
                <p className="text-xs font-semibold text-green-700 uppercase tracking-wider">
                  Primary Results
                </p>
              </div>
              <p className="text-sm text-green-900 leading-relaxed">{primaryResults}</p>
            </div>
          )}

          {/* Additional Findings */}
          {additionalFindings && (
            <div className="rounded-lg bg-amber-50 border border-amber-100 px-4 py-3">
              <div className="flex items-center gap-1.5 mb-2">
                <Plus size={12} className="text-amber-600" />
                <p className="text-xs font-semibold text-amber-700 uppercase tracking-wider">
                  Additional Findings
                </p>
              </div>
              <p className="text-sm text-amber-900 leading-relaxed">{additionalFindings}</p>
            </div>
          )}

          {/* Render any other top-level string/number fields not already shown */}
          {renderExtraFields(paper)}
        </div>
      )}
    </div>
  );
}

const KNOWN_EVIDENCE_KEYS = new Set([
  'reference', 'citation', 'title', 'year', 'country', 'setting_country',
  'study_type', 'study_design', 'peer_reviewed', 'intervention', 'intervention_description',
  'population', 'participants', 'setting', 'study_setting',
  'primary_results', 'main_findings', 'results', 'additional_findings',
  'secondary_findings', 'other_findings',
]);

function renderExtraFields(paper) {
  const extras = Object.entries(paper).filter(
    ([k, v]) =>
      !KNOWN_EVIDENCE_KEYS.has(k) &&
      (typeof v === 'string' || typeof v === 'number') &&
      v !== '' &&
      v !== null &&
      v !== undefined
  );
  if (!extras.length) return null;
  return (
    <div className="pt-1 border-t border-gray-50 grid grid-cols-2 gap-x-4 gap-y-3">
      {extras.map(([key, val]) => (
        <InfoChip
          key={key}
          label={key.replace(/_/g, ' ')}
          value={typeof val === 'number' ? String(val) : truncate(val, 100)}
        />
      ))}
    </div>
  );
}

export default function EvidenceTab({ papers }) {
  if (!papers || papers.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <div className="w-12 h-12 rounded-2xl bg-gray-100 flex items-center justify-center mb-3">
          <BookOpen size={20} className="text-gray-300" />
        </div>
        <p className="text-gray-400 text-sm">No evidence data available</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between mb-2">
        <p className="text-xs text-gray-400 font-medium">
          {papers.length} paper{papers.length !== 1 ? 's' : ''} extracted
        </p>
      </div>
      {papers.map((paper, i) => (
        <EvidenceCard key={i} paper={paper} index={i} />
      ))}
    </div>
  );
}
