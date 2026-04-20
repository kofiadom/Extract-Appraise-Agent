import { useState, useRef, useEffect, useCallback } from 'react';
import {
  UploadCloud, FileText, Send, Loader2, Trash2, X,
  BookOpen, ChevronDown, AlertCircle, Bot, User,
} from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { startIndexJob, pollIndexJob, listChatDocuments, deleteChatDocument, chatQueryStream } from '../services/api.js';

// Markdown component overrides — styled for the chat bubble context
const MD_COMPONENTS = {
  p:          ({ children }) => <p className="mb-2 last:mb-0">{children}</p>,
  h1:         ({ children }) => <p className="font-bold text-base mb-1">{children}</p>,
  h2:         ({ children }) => <p className="font-bold mb-1">{children}</p>,
  h3:         ({ children }) => <p className="font-semibold mb-1">{children}</p>,
  ul:         ({ children }) => <ul className="list-disc list-outside pl-4 mb-2 space-y-0.5">{children}</ul>,
  ol:         ({ children }) => <ol className="list-decimal list-outside pl-4 mb-2 space-y-0.5">{children}</ol>,
  li:         ({ children }) => <li className="leading-snug">{children}</li>,
  strong:     ({ children }) => <strong className="font-semibold">{children}</strong>,
  em:         ({ children }) => <em className="italic">{children}</em>,
  a:          ({ href, children }) => <a href={href} target="_blank" rel="noreferrer" className="underline underline-offset-2 opacity-80 hover:opacity-100">{children}</a>,
  blockquote: ({ children }) => <blockquote className="border-l-2 border-current pl-3 opacity-70 my-1">{children}</blockquote>,
  hr:         () => <hr className="my-2 border-current opacity-20" />,
  code:       ({ inline, children }) =>
    inline
      ? <code className="bg-black/10 rounded px-1 py-0.5 text-xs font-mono">{children}</code>
      : <pre className="bg-black/10 rounded-lg p-3 my-2 overflow-x-auto text-xs font-mono whitespace-pre-wrap"><code>{children}</code></pre>,
  table:      ({ children }) => <div className="overflow-x-auto my-2"><table className="text-xs border-collapse w-full">{children}</table></div>,
  th:         ({ children }) => <th className="border border-current/20 px-2 py-1 font-semibold bg-black/5 text-left">{children}</th>,
  td:         ({ children }) => <td className="border border-current/20 px-2 py-1">{children}</td>,
};

// Renders a single chat message bubble
function MessageBubble({ msg }) {
  const isUser = msg.role === 'user';
  return (
    <div className={`flex gap-3 ${isUser ? 'flex-row-reverse' : 'flex-row'}`}>
      {/* Avatar */}
      <div
        className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-semibold
          ${isUser ? 'bg-[#1B2A4A]' : 'bg-emerald-600'}`}
      >
        {isUser ? <User size={14} /> : <Bot size={14} />}
      </div>

      {/* Bubble + tool status */}
      <div className="flex flex-col gap-1.5 max-w-[78%]">
        {msg.toolStatus && (
          <div className="flex items-center gap-1.5 text-xs text-emerald-600">
            <Loader2 size={11} className="animate-spin" />
            {msg.toolStatus}
          </div>
        )}
        <div
          className={`rounded-2xl px-4 py-3 text-sm leading-relaxed
            ${isUser
              ? 'bg-[#1B2A4A] text-white rounded-tr-sm'
              : 'bg-white border border-gray-100 text-gray-800 shadow-card rounded-tl-sm'
            }
            ${msg.isError ? 'bg-red-50 border-red-200 text-red-700' : ''}
          `}
        >
          {isUser ? (
            <span className="whitespace-pre-wrap">{msg.content}</span>
          ) : (
            <ReactMarkdown remarkPlugins={[remarkGfm]} components={MD_COMPONENTS}>
              {msg.content}
            </ReactMarkdown>
          )}
          {msg.isStreaming && (
            <span className="inline-block w-1.5 h-4 ml-0.5 bg-emerald-500 rounded-sm animate-pulse align-middle" />
          )}
        </div>
      </div>
    </div>
  );
}

export default function ChatWithDoc({ apiUrl }) {
  // ── document state ──────────────────────────────────────────────────────────
  const [documents, setDocuments] = useState([]);
  const [selectedDoc, setSelectedDoc] = useState(null); // { doc_id, doc_name, page_count }
  const [docDropdownOpen, setDocDropdownOpen] = useState(false);

  // ── upload/index state ──────────────────────────────────────────────────────
  const [indexing, setIndexing] = useState(false);
  const [indexError, setIndexError] = useState('');
  const fileInputRef = useRef(null);

  // ── chat state ──────────────────────────────────────────────────────────────
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);
  // Each selected document gets its own session ID so Agno keeps separate histories
  const sessionIdRef = useRef(null);

  // ── load documents on mount ─────────────────────────────────────────────────
  const loadDocuments = useCallback(async () => {
    try {
      const data = await listChatDocuments(apiUrl);
      setDocuments(data.documents || []);
    } catch {
      // Silently ignore — PageIndex may not be installed yet
    }
  }, [apiUrl]);

  useEffect(() => { loadDocuments(); }, [loadDocuments]);

  // ── auto-scroll chat ────────────────────────────────────────────────────────
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // ── upload & index a PDF (async + polling) ─────────────────────────────────
  async function handleFileSelect(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';

    setIndexing(true);
    setIndexError('');
    try {
      const jobId = await startIndexJob(apiUrl, file);

      // Poll every 6 s until done or error
      const result = await new Promise((resolve, reject) => {
        const interval = setInterval(async () => {
          try {
            const job = await pollIndexJob(apiUrl, jobId);
            if (job.status === 'done') {
              clearInterval(interval);
              resolve(job.result);
            } else if (job.status === 'error') {
              clearInterval(interval);
              reject(new Error(job.error || 'Indexing failed'));
            }
          } catch (err) {
            clearInterval(interval);
            reject(err);
          }
        }, 6000);
      });

      await loadDocuments();
      sessionIdRef.current = crypto.randomUUID();
      setSelectedDoc({
        doc_id: result.doc_id,
        doc_name: result.filename,
        page_count: result.page_count,
      });
      setMessages([{
        id: Date.now(),
        role: 'assistant',
        content: `Document **${result.filename}** indexed successfully (${result.page_count ?? '?'} pages). Ask me anything about it!`,
      }]);
    } catch (err) {
      const detail =
        err?.response?.data?.detail ||
        err?.message ||
        'Indexing failed.';
      setIndexError(detail);
    } finally {
      setIndexing(false);
    }
  }

  // ── select a document from the dropdown ────────────────────────────────────
  function handleSelectDoc(doc) {
    sessionIdRef.current = crypto.randomUUID();
    setSelectedDoc(doc);
    setDocDropdownOpen(false);
    setMessages([{
      id: Date.now(),
      role: 'assistant',
      content: `Switched to **${doc.doc_name}**${doc.page_count ? ` (${doc.page_count} pages)` : ''}. What would you like to know?`,
    }]);
  }

  // ── remove a document ───────────────────────────────────────────────────────
  async function handleRemoveDoc(doc_id, e) {
    e.stopPropagation();
    try {
      await deleteChatDocument(apiUrl, doc_id);
      await loadDocuments();
      if (selectedDoc?.doc_id === doc_id) {
        setSelectedDoc(null);
        setMessages([]);
      }
    } catch {
      // ignore
    }
  }

  // ── send a chat message ─────────────────────────────────────────────────────
  async function handleSend() {
    const text = input.trim();
    if (!text || !selectedDoc || sending) return;

    setInput('');
    setSending(true);

    const userMsg = { id: Date.now(), role: 'user', content: text };
    const assistantId = Date.now() + 1;
    const assistantMsg = { id: assistantId, role: 'assistant', content: '', isStreaming: true };

    setMessages((prev) => [...prev, userMsg, assistantMsg]);

    chatQueryStream(apiUrl, selectedDoc.doc_id, text, sessionIdRef.current, {
      onChunk(chunk) {
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantId
              ? { ...m, content: m.content + chunk }
              : m
          )
        );
      },
      onToolCall(toolName) {
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantId
              ? { ...m, toolStatus: `Calling ${toolName}…` }
              : m
          )
        );
      },
      onDone() {
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantId
              ? { ...m, isStreaming: false, toolStatus: null }
              : m
          )
        );
        setSending(false);
        inputRef.current?.focus();
      },
      onError(err) {
        const errText = err?.message || 'Something went wrong.';
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantId
              ? { ...m, content: errText, isStreaming: false, toolStatus: null, isError: true }
              : m
          )
        );
        setSending(false);
        inputRef.current?.focus();
      },
    });
  }

  function handleKeyDown(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  // ── render ──────────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col h-full" style={{ minHeight: 'calc(100vh - 160px)' }}>

      {/* ── Document selector bar ────────────────────────────────────────── */}
      <div className="card p-4 mb-5 flex items-center gap-3 flex-wrap">
        {/* Dropdown */}
        <div className="relative flex-1 min-w-[220px]">
          <button
            onClick={() => setDocDropdownOpen((v) => !v)}
            className="w-full flex items-center gap-2 px-3 py-2 rounded-lg border border-gray-200 bg-white hover:border-[#1B2A4A]/40 transition-colors text-sm"
          >
            <BookOpen size={14} className="text-[#1B2A4A] flex-shrink-0" />
            <span className="flex-1 text-left truncate text-gray-700">
              {selectedDoc ? selectedDoc.doc_name : 'Select a document…'}
            </span>
            {selectedDoc?.page_count && (
              <span className="text-xs text-gray-400 flex-shrink-0">{selectedDoc.page_count}p</span>
            )}
            <ChevronDown size={13} className="text-gray-400 flex-shrink-0" />
          </button>

          {docDropdownOpen && (
            <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-xl shadow-card-lg z-20 overflow-hidden">
              {documents.length === 0 ? (
                <p className="text-xs text-gray-400 px-4 py-3 text-center">No documents indexed yet.</p>
              ) : (
                documents.map((doc) => (
                  <div
                    key={doc.doc_id}
                    onClick={() => handleSelectDoc(doc)}
                    className={`flex items-center gap-2 px-4 py-2.5 cursor-pointer text-sm transition-colors
                      ${selectedDoc?.doc_id === doc.doc_id
                        ? 'bg-[#1B2A4A]/5 text-[#1B2A4A] font-medium'
                        : 'text-gray-700 hover:bg-gray-50'
                      }`}
                  >
                    <FileText size={13} className="flex-shrink-0 text-gray-400" />
                    <span className="flex-1 truncate">{doc.doc_name}</span>
                    {doc.page_count && (
                      <span className="text-xs text-gray-400">{doc.page_count}p</span>
                    )}
                    <button
                      onClick={(e) => handleRemoveDoc(doc.doc_id, e)}
                      className="flex-shrink-0 p-1 rounded hover:bg-red-100 hover:text-red-500 text-gray-300 transition-colors"
                      title="Remove document"
                    >
                      <Trash2 size={12} />
                    </button>
                  </div>
                ))
              )}
            </div>
          )}
        </div>

        {/* Upload button */}
        <button
          onClick={() => fileInputRef.current?.click()}
          disabled={indexing}
          className="btn-secondary flex-shrink-0"
          title="Upload & index a new PDF"
        >
          {indexing ? (
            <><Loader2 size={14} className="animate-spin" /> Indexing…</>
          ) : (
            <><UploadCloud size={14} /> Index PDF</>
          )}
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept=".pdf,application/pdf"
          className="hidden"
          onChange={handleFileSelect}
        />

        {/* Clear chat */}
        {messages.length > 0 && (
          <button
            onClick={() => {
              sessionIdRef.current = crypto.randomUUID();
              setMessages([]);
            }}
            className="btn-secondary flex-shrink-0"
            title="Clear conversation"
          >
            <X size={14} /> Clear
          </button>
        )}
      </div>

      {/* ── Indexing error ───────────────────────────────────────────────── */}
      {indexError && (
        <div className="mb-4 flex items-start gap-3 p-4 rounded-xl bg-red-50 border border-red-200">
          <AlertCircle size={16} className="text-red-500 flex-shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="text-sm font-medium text-red-800">Indexing failed</p>
            <p className="text-xs text-red-700 mt-0.5">{indexError}</p>
          </div>
          <button onClick={() => setIndexError('')} className="text-red-400 hover:text-red-600">
            <X size={14} />
          </button>
        </div>
      )}

      {/* ── Indexing progress banner ─────────────────────────────────────── */}
      {indexing && (
        <div className="mb-4 flex items-center gap-3 p-4 rounded-xl bg-blue-50 border border-blue-100">
          <Loader2 size={16} className="text-blue-500 animate-spin flex-shrink-0" />
          <div>
            <p className="text-sm font-medium text-blue-800">Building PageIndex tree…</p>
            <p className="text-xs text-blue-600 mt-0.5">
              Parsing document structure and generating summaries. This takes 30–90 seconds.
            </p>
          </div>
        </div>
      )}

      {/* ── Empty state (no doc selected) ───────────────────────────────── */}
      {!selectedDoc && !indexing && (
        <div className="flex-1 flex flex-col items-center justify-center text-center py-16 card">
          <div className="w-16 h-16 rounded-2xl bg-[#1B2A4A]/5 flex items-center justify-center mb-4">
            <BookOpen size={28} className="text-[#1B2A4A]/40" />
          </div>
          <p className="text-gray-700 font-medium mb-1">No document selected</p>
          <p className="text-gray-400 text-sm max-w-xs">
            Upload a PDF to index it with PageIndex, or select an already-indexed document above.
          </p>
          <button
            onClick={() => fileInputRef.current?.click()}
            className="btn-primary mt-5"
          >
            <UploadCloud size={15} /> Upload & Index PDF
          </button>
        </div>
      )}

      {/* ── Chat area ───────────────────────────────────────────────────── */}
      {selectedDoc && (
        <div className="flex flex-col flex-1 card overflow-hidden">
          {/* Messages scroll area */}
          <div className="flex-1 overflow-y-auto px-5 py-5 space-y-4" style={{ minHeight: 320, maxHeight: 520 }}>
            {messages.length === 0 && (
              <div className="flex flex-col items-center justify-center h-full text-center py-8">
                <Bot size={28} className="text-gray-300 mb-3" />
                <p className="text-gray-500 text-sm font-medium">
                  Ask anything about <span className="font-semibold text-[#1B2A4A]">{selectedDoc.doc_name}</span>
                </p>
                <p className="text-gray-400 text-xs mt-1">
                  PageIndex will reason over the document's structure to find the right pages.
                </p>
              </div>
            )}
            {messages.map((msg) => (
              <MessageBubble key={msg.id} msg={msg} />
            ))}
            <div ref={messagesEndRef} />
          </div>

          {/* Divider */}
          <div className="border-t border-gray-100" />

          {/* Input row */}
          <div className="px-4 py-3 flex items-end gap-3">
            <textarea
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              disabled={sending || !selectedDoc}
              placeholder={selectedDoc ? `Ask about ${selectedDoc.doc_name}…` : 'Select a document first'}
              rows={1}
              className="flex-1 resize-none rounded-xl border border-gray-200 bg-gray-50 px-4 py-2.5 text-sm text-gray-800 placeholder-gray-400 focus:outline-none focus:border-[#1B2A4A]/40 focus:bg-white transition-colors disabled:opacity-50"
              style={{ maxHeight: 120 }}
              onInput={(e) => {
                e.target.style.height = 'auto';
                e.target.style.height = Math.min(e.target.scrollHeight, 120) + 'px';
              }}
            />
            <button
              onClick={handleSend}
              disabled={!input.trim() || sending || !selectedDoc}
              className="flex-shrink-0 w-10 h-10 rounded-xl bg-[#1B2A4A] text-white flex items-center justify-center hover:bg-[#152038] transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              title="Send (Enter)"
            >
              {sending
                ? <Loader2 size={16} className="animate-spin" />
                : <Send size={16} />
              }
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
