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
  const inputT = m.input_tokens || 0;
  const outputT = m.output_tokens || 0;
  const totalT = m.total_tokens || inputT + outputT;
  // Use reported cost; fall back to per-node estimate using that node's own model
  const nodeCost = m.cost || estimateCost(node.model || '', inputT, outputT);

  const totals = {
    input_tokens: inputT,
    output_tokens: outputT,
    total_tokens: totalT,
    cost_usd: nodeCost,
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

// ── Chat with Doc (PageIndex) ──────────────────────────────────────────────

/**
 * Upload a PDF and index it with PageIndex.
 * @param {string} baseURL
 * @param {File} file
 * @returns {Promise<{ doc_id: string, filename: string, page_count: number|null }>}
 */
export async function indexDocument(baseURL, file) {
  const client = createApiClient(baseURL);
  const fd = new FormData();
  fd.append('file', file);
  const res = await client.post('/chat/index', fd, {
    headers: { 'Content-Type': 'multipart/form-data' },
    timeout: 180_000, // indexing can take up to ~90 s
  });
  return res.data;
}

/**
 * List all documents indexed in the PageIndex workspace.
 * @param {string} baseURL
 * @returns {Promise<{ documents: Array<{ doc_id, doc_name, page_count }> }>}
 */
export async function listChatDocuments(baseURL) {
  const client = createApiClient(baseURL);
  const res = await client.get('/chat/documents');
  return res.data;
}

/**
 * Remove an indexed document from the PageIndex workspace.
 * @param {string} baseURL
 * @param {string} docId
 */
export async function deleteChatDocument(baseURL, docId) {
  const client = createApiClient(baseURL);
  const res = await client.delete(`/chat/document/${docId}`);
  return res.data;
}

/**
 * Ask a question about an indexed document via the AgentOS chat endpoint.
 * The message is formatted so the agent can extract the doc_id:
 *   DOC_ID: <docId>
 *   Question: <message>
 *
 * Returns the full answer string from the agent.
 *
 * @param {string} baseURL
 * @param {string} docId
 * @param {string} message
 * @param {Array<{role: string, content: string}>} history  — previous turns for context
 * @returns {Promise<string>}
 */
export async function chatQuery(baseURL, docId, message, sessionId = null) {
  const client = createApiClient(baseURL);

  const fd = new FormData();
  fd.append('message', `DOC_ID: ${docId}\nQuestion: ${message}`);
  fd.append('stream', 'false');
  fd.append('monitor', 'false');
  if (sessionId) fd.append('session_id', sessionId);

  const res = await client.post('/agents/pageindex-chat-agent/runs', fd, {
    timeout: 120_000,
  });

  // AgentOS returns { content: "...", ... }
  return res.data?.content ?? res.data?.message ?? JSON.stringify(res.data);
}

/**
 * Stream a chat query via AgentOS SSE.
 * Calls callbacks as events arrive:
 *   onChunk(text)        — new content token(s)
 *   onToolCall(toolName) — agent invoked a tool
 *   onDone()             — stream finished
 *   onError(err)         — fatal error
 */
export async function chatQueryStream(baseURL, docId, message, sessionId = null, callbacks = {}) {
  const { onChunk, onToolCall, onDone, onError } = callbacks;

  const fd = new FormData();
  fd.append('message', `DOC_ID: ${docId}\nQuestion: ${message}`);
  fd.append('stream', 'true');
  if (sessionId) fd.append('session_id', sessionId);

  const url = baseURL.replace(/\/$/, '') + '/agents/pageindex-chat-agent/runs';

  let response;
  try {
    response = await fetch(url, { method: 'POST', body: fd });
  } catch (err) {
    onError?.(err);
    return;
  }

  if (!response.ok) {
    const text = await response.text().catch(() => `HTTP ${response.status}`);
    onError?.(new Error(text));
    return;
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });

      // SSE blocks are separated by double newline
      const blocks = buffer.split('\n\n');
      buffer = blocks.pop() ?? '';

      for (const block of blocks) {
        for (const line of block.split('\n')) {
          if (!line.startsWith('data: ')) continue;
          const raw = line.slice(6).trim();
          if (!raw || raw === '[DONE]') { onDone?.(); return; }

          let evt;
          try { evt = JSON.parse(raw); } catch { continue; }

          const eventType = (evt.event ?? '').toLowerCase().replace(/_/g, '');
          if (eventType === 'runcontent' && evt.content) {
            onChunk?.(evt.content);
          } else if (eventType === 'toolcallstarted') {
            onToolCall?.(evt.tool?.tool_name ?? 'tool');
          } else if (eventType === 'runcompleted' || eventType === 'runerror') {
            onDone?.();
            return;
          }
        }
      }
    }
  } catch (err) {
    onError?.(err);
    return;
  }

  onDone?.();
}
