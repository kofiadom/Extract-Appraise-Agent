import { useRef, useState } from 'react';
import { Upload, X, FileText, Loader2 } from 'lucide-react';
import { parseTemplates, pollByotJob } from '../services/api.js';

const ACCEPTED = '.pdf,.doc,.docx,.xls,.xlsx,.csv';

function FileDropZone({ label, file, onFile, disabled }) {
  const inputRef = useRef(null);

  function handleDrop(e) {
    e.preventDefault();
    const f = e.dataTransfer.files[0];
    if (f) onFile(f);
  }

  return (
    <div
      onDragOver={(e) => e.preventDefault()}
      onDrop={handleDrop}
      onClick={() => !disabled && inputRef.current?.click()}
      className={`relative border-2 border-dashed rounded-xl p-5 flex flex-col items-center gap-2 cursor-pointer transition-colors
        ${disabled ? 'opacity-50 cursor-not-allowed border-gray-200 bg-gray-50' : 'border-blue-200 bg-blue-50 hover:border-blue-400 hover:bg-blue-100'}`}
    >
      <input
        ref={inputRef}
        type="file"
        accept={ACCEPTED}
        className="hidden"
        disabled={disabled}
        onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])}
      />
      {file ? (
        <div className="flex items-center gap-2 w-full min-w-0">
          <FileText size={15} className="text-blue-500 flex-shrink-0" />
          <span className="text-sm text-blue-800 font-medium truncate flex-1">{file.name}</span>
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onFile(null); }}
            className="flex-shrink-0 p-0.5 rounded hover:bg-blue-200 transition-colors"
          >
            <X size={13} className="text-blue-500" />
          </button>
        </div>
      ) : (
        <>
          <Upload size={18} className="text-blue-400" />
          <p className="text-xs text-blue-600 font-medium text-center">{label}</p>
          <p className="text-xs text-blue-400">PDF, Word, Excel, CSV</p>
        </>
      )}
    </div>
  );
}

export default function TemplateUploadSection({ onParsed, onError }) {
  const [extractionFile, setExtractionFile] = useState(null);
  const [appraisalFile, setAppraisalFile] = useState(null);
  const [loading, setLoading] = useState(false);

  const canParse = (extractionFile || appraisalFile) && !loading;

  async function handleParse() {
    if (!canParse) return;
    setLoading(true);
    try {
      const jobId = await parseTemplates(extractionFile, appraisalFile);

      // Poll until done
      const POLL_MS = 5_000;
      const TIMEOUT_MS = 5 * 60 * 1000;
      const deadline = Date.now() + TIMEOUT_MS;

      while (Date.now() < deadline) {
        await new Promise((r) => setTimeout(r, POLL_MS));
        const job = await pollByotJob(jobId);
        if (job.status === 'done' && job.result) {
          onParsed(job.result, {
            extraction: extractionFile?.name,
            appraisal: appraisalFile?.name,
          });
          return;
        }
        if (job.status === 'error') {
          throw new Error(job.error || 'Template parsing failed');
        }
      }
      throw new Error('Template parsing timed out');
    } catch (err) {
      onError(err.message || 'Template parsing failed');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
            Extraction Template
          </p>
          <FileDropZone
            label="Drop extraction template here"
            file={extractionFile}
            onFile={setExtractionFile}
            disabled={loading}
          />
        </div>
        <div>
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
            Appraisal Template
          </p>
          <FileDropZone
            label="Drop appraisal template here"
            file={appraisalFile}
            onFile={setAppraisalFile}
            disabled={loading}
          />
        </div>
      </div>

      <button
        onClick={handleParse}
        disabled={!canParse}
        className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-[#1B2A4A] text-white text-sm font-medium
          hover:bg-[#243660] transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
      >
        {loading ? (
          <>
            <Loader2 size={15} className="animate-spin" />
            Parsing templates…
          </>
        ) : (
          <>
            <FileText size={15} />
            Parse Templates
          </>
        )}
      </button>
    </div>
  );
}
