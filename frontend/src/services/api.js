import axios from 'axios';

// ── Config ────────────────────────────────────────────────────────────────────

const BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3001';

const PRICING = {
  'zai.glm-5': { input: 1.00, output: 3.20 },
  'moonshotai.kimi-k2.5': { input: 0.14, output: 0.59 },
  'anthropic.claude-sonnet-4-6': { input: 3.00, output: 15.00 },
  'minimax.minimax-m2.5': { input: 0.40, output: 1.20 },
};

// ── Token management ──────────────────────────────────────────────────────────

export function getToken() {
  return localStorage.getItem('auth_token');
}

export function setToken(token) {
  localStorage.setItem('auth_token', token);
}

export function clearToken() {
  localStorage.removeItem('auth_token');
}

// ── Axios instance with auth interceptors ─────────────────────────────────────

const api = axios.create({ baseURL: BASE_URL });

api.interceptors.request.use((config) => {
  const token = getToken();
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

api.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401) {
      clearToken();
      window.location.reload();
    }
    return Promise.reject(err);
  },
);

// ── Auth ──────────────────────────────────────────────────────────────────────

export async function login(email, password) {
  const { data } = await api.post('/api/v1/auth/login', { email, password });
  return data; // { access_token, ... }
}

export async function register(email, password) {
  const { data } = await api.post('/api/v1/auth/register', { email, password });
  return data; // { access_token, ... }
}

// ── Pipeline ──────────────────────────────────────────────────────────────────

export async function uploadFiles(files) {
  const fd = new FormData();
  files.forEach((f) => fd.append('files', f));
  const { data } = await api.post('/api/v1/papers/upload', fd, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
  return data.data; // { files, markdownFiles }
}

export async function startPipelineJob(markdownFiles) {
  const { data } = await api.post('/api/v1/pipeline/run', { markdownFiles });
  return data.data.jobId;
}

export async function pollPipelineJob(jobId) {
  const { data } = await api.get(`/api/v1/pipeline/${jobId}`);
  return data.data; // { jobId, status, progress, error? }
}

export async function getPipelineResult(jobId) {
  const { data } = await api.get(`/api/v1/pipeline/${jobId}/result`);
  return data.data; // { content, metrics, member_responses, ... }
}

export async function downloadFile(type, jobId) {
  const res = await api.get(`/api/v1/exports/${type}`, {
    params: { jobId },
    responseType: 'blob',
  });
  const filenameMap = {
    excel: 'evidence_table.xlsx',
    docx: 'quality_appraisal.docx',
    json: 'full_data.json',
  };
  const url = URL.createObjectURL(res.data);
  const a = document.createElement('a');
  a.href = url;
  a.download = filenameMap[type];
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// ── Chat with Doc ─────────────────────────────────────────────────────────────

export async function startIndexJob(file) {
  const fd = new FormData();
  fd.append('file', file);
  const { data } = await api.post('/api/v1/chat/index', fd, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
  return data.data.jobId;
}

export async function pollIndexJob(jobId) {
  const { data } = await api.get(`/api/v1/chat/index/jobs/${jobId}`);
  return data.data; // { jobId, status, progress, result?, error? }
}

export async function listChatDocuments() {
  const { data } = await api.get('/api/v1/chat/documents');
  const docs = data.data || [];
  // Map TypeORM entity camelCase → snake_case used by components
  return docs.map((doc) => ({
    doc_id: doc.docId,
    doc_name: doc.fileName,
    page_count: doc.pageCount,
  }));
}

export async function deleteChatDocument(docId) {
  await api.delete(`/api/v1/chat/documents/${docId}`);
}

/**
 * Stream a chat query via NestJS → FastAPI SSE proxy.
 * Calls callbacks as SSE events arrive.
 *   onChunk(text)        — new content token(s)
 *   onToolCall(toolName) — agent invoked a tool
 *   onDone()             — stream finished
 *   onError(err)         — fatal error
 */
export async function chatQueryStream(docId, message, sessionId, callbacks = {}) {
  const { onChunk, onToolCall, onDone, onError } = callbacks;
  const token = getToken();
  const url = BASE_URL.replace(/\/$/, '') + '/api/v1/chat/query/stream';

  let response;
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({
        message: `DOC_ID: ${docId}\nQuestion: ${message}`,
        sessionId,
      }),
    });
  } catch (err) {
    onError?.(err);
    return;
  }

  if (!response.ok) {
    if (response.status === 401) {
      clearToken();
      window.location.reload();
      return;
    }
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

// ── Utilities ─────────────────────────────────────────────────────────────────

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

export function sumMetrics(node, _byModel = {}) {
  const m = node.metrics || {};
  const inputT = m.input_tokens || 0;
  const outputT = m.output_tokens || 0;
  const totalT = m.total_tokens || inputT + outputT;
  const modelId = node.model || '';
  const nodeCost = m.cost || estimateCost(modelId, inputT, outputT);

  if (modelId && (inputT || outputT)) {
    if (!_byModel[modelId]) _byModel[modelId] = { input_tokens: 0, output_tokens: 0, cost_usd: 0 };
    _byModel[modelId].input_tokens += inputT;
    _byModel[modelId].output_tokens += outputT;
    _byModel[modelId].cost_usd += nodeCost;
  }

  const totals = { input_tokens: inputT, output_tokens: outputT, total_tokens: totalT, cost_usd: nodeCost, by_model: _byModel };

  for (const member of node.member_responses || []) {
    const child = sumMetrics(member, _byModel);
    totals.input_tokens += child.input_tokens;
    totals.output_tokens += child.output_tokens;
    totals.total_tokens += child.total_tokens;
    totals.cost_usd += child.cost_usd;
  }

  return totals;
}

export function estimateCost(modelId, inputTokens, outputTokens) {
  const modelKey = Object.keys(PRICING).find((k) =>
    modelId?.toLowerCase().includes(k.toLowerCase()),
  );
  if (!modelKey) return 0;
  const { input, output } = PRICING[modelKey];
  return (inputTokens / 1_000_000) * input + (outputTokens / 1_000_000) * output;
}

export { PRICING };
