import axios from 'axios';

const PRICING = {
  'zai.glm-5': { input: 1.00, output: 3.20 },
  'moonshotai.kimi-k2.5': { input: 0.14, output: 0.59 },
  'anthropic.claude-sonnet-4-6': { input: 3.00, output: 15.00 },
  'minimax.minimax-m2.5': { input: 0.40, output: 1.20 },
};

export function createApiClient(baseURL) {
  return axios.create({ baseURL });
}

/**
 * Upload PDF files to the backend.
 * @param {string} baseURL
 * @param {File[]} files
 * @returns {Promise<{ files: string[], markdown_files: string[] }>}
 */
export async function uploadFiles(baseURL, files) {
  const client = createApiClient(baseURL);
  const fd = new FormData();
  files.forEach((f) => fd.append('files', f));
  const res = await client.post('/upload-fs', fd, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
  return res.data;
}

/**
 * Run the evidence extraction + appraisal pipeline.
 * @param {string} baseURL
 * @param {string[]} markdownFiles - array of markdown filenames from upload response
 * @returns {Promise<{ raw: object, parsed: object|null }>}
 */
export async function runPipeline(baseURL, markdownFiles) {
  const client = createApiClient(baseURL);
  const message =
    `Files: ${markdownFiles.join(', ')}\n\nExtract structured evidence from ALL provided markdown files, then perform REST quality appraisal on each paper.`;

  const fd = new FormData();
  fd.append('message', message);
  fd.append('stream', 'false');
  fd.append('monitor', 'false');

  const res = await client.post('/teams/fs-evidence-team/runs', fd);
  return res.data;
}

/**
 * Store pipeline results in the backend so downloads work.
 * @param {string} baseURL
 * @param {object} parsed - parsed evidence + appraisal data
 */
export async function storeResults(baseURL, parsed) {
  const client = createApiClient(baseURL);
  const body = {
    papers: parsed.papers || [],
    appraisal: parsed.appraisal || { appraisals: [] },
  };
  const res = await client.post('/pipeline/store', body);
  return res.data;
}

/**
 * Download a file from the backend.
 * @param {string} baseURL
 * @param {'excel'|'docx'|'json'} type
 */
export async function downloadFile(baseURL, type) {
  const client = createApiClient(baseURL);
  const endpointMap = {
    excel: '/pipeline/download/excel',
    docx: '/pipeline/download/docx',
    json: '/pipeline/download/json',
  };
  const filenameMap = {
    excel: 'evidence_table.xlsx',
    docx: 'quality_appraisal.docx',
    json: 'full_data.json',
  };

  const res = await client.get(endpointMap[type], { responseType: 'blob' });
  const url = URL.createObjectURL(res.data);
  const a = document.createElement('a');
  a.href = url;
  a.download = filenameMap[type];
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * Reset the pipeline state on the backend.
 * @param {string} baseURL
 */
export async function resetPipeline(baseURL) {
  const client = createApiClient(baseURL);
  const res = await client.delete('/pipeline/reset');
  return res.data;
}

/**
 * Parse the team run content field into structured data.
 * @param {string} content
 * @returns {object|null}
 */
export function parseTeamContent(content) {
  if (!content) return null;

  const attempts = [
    content,
    content.replace(/^```(?:json)?\s*|\s*```$/gm, '').trim(),
  ];

  for (const c of attempts) {
    try {
      const d = JSON.parse(c.trim());
      if (d?.papers) return d;
    } catch {
      // ignore
    }
  }

  const start = content.indexOf('{');
  if (start !== -1) {
    let depth = 0;
    for (let i = start; i < content.length; i++) {
      if (content[i] === '{') {
        depth++;
      } else if (content[i] === '}') {
        depth--;
        if (depth === 0) {
          try {
            const d = JSON.parse(content.slice(start, i + 1));
            if (d?.papers) return d;
          } catch {
            // ignore
          }
          break;
        }
      }
    }
  }

  return null;
}

/**
 * Recursively sum token usage and cost from nested agent response tree.
 * @param {object} node
 * @returns {{ input_tokens: number, output_tokens: number, total_tokens: number, cost_usd: number }}
 */
export function sumMetrics(node) {
  const m = node.metrics || {};
  const totals = {
    input_tokens: m.input_tokens || 0,
    output_tokens: m.output_tokens || 0,
    total_tokens: m.total_tokens || 0,
    cost_usd: m.cost || 0,
  };

  for (const member of node.member_responses || []) {
    const child = sumMetrics(member);
    totals.input_tokens += child.input_tokens;
    totals.output_tokens += child.output_tokens;
    totals.total_tokens += child.total_tokens;
    totals.cost_usd += child.cost_usd;
  }

  return totals;
}

/**
 * Estimate cost from token counts if the API doesn't return cost directly.
 * @param {string} modelId
 * @param {number} inputTokens
 * @param {number} outputTokens
 * @returns {number}
 */
export function estimateCost(modelId, inputTokens, outputTokens) {
  const modelKey = Object.keys(PRICING).find((k) =>
    modelId?.toLowerCase().includes(k.toLowerCase())
  );
  if (!modelKey) return 0;
  const { input, output } = PRICING[modelKey];
  return (inputTokens / 1_000_000) * input + (outputTokens / 1_000_000) * output;
}

export { PRICING };
