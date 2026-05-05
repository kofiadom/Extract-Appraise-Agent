"""
REST Evidence Extractor — powered by AgentOS (FileSearch + LlamaParse)
=======================================================================

Run:
    python app.py               # starts on port 7777
    fastapi dev app.py          # dev mode with hot-reload

AgentOS endpoints:
    POST /agents/fs-extraction-agent/runs    -> Run extraction agent directly
    POST /agents/fs-appraisal-agent/runs     -> Run appraisal agent directly
    POST /teams/fs-evidence-team/runs        -> Run full pipeline (extract → appraise)
    POST /agents/pageindex-chat-agent/runs   -> Chat with an indexed document (PageIndex)

Custom endpoints:
    POST   /upload-fs                  -> Upload PDFs, convert to markdown via LlamaParse
    POST   /pipeline/run-async         -> Start pipeline job (returns job_id)
    GET    /pipeline/job/{id}          -> Poll pipeline job status

    POST   /chat/index                 -> Upload & index a PDF with PageIndex
    GET    /chat/documents             -> List indexed documents
    DELETE /chat/document/{doc_id}     -> Remove an indexed document

Required .env vars for Chat with Doc:
    PAGEINDEX_API_KEY   — get from https://pageindex.ai/developer
    (indexing is handled by the PageIndex cloud; no local LLM needed for that step)
"""

import asyncio
import logging
import os
import uuid
from pathlib import Path

from dotenv import load_dotenv

load_dotenv()

from utils.llamaparse_helper import parse_pdf_to_markdown

LLAMA_CLOUD_API_KEY = os.getenv("LLAMAPARSE_API_KEY", "")
FS_MARKDOWN_DIR = Path("tmp/papers_fs_md")

from fastapi import BackgroundTasks, FastAPI, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware

from agno.db.postgres import PostgresDb
from agno.models.aws import AwsBedrock
from agno.os import AgentOS
from agno.team import Team
from agno.team.mode import TeamMode

from agents.extraction_agent import create_filesearch_extraction_agent, EXTRACTION_PROMPT_FS
from agents.appraisal_agent import create_filesearch_appraisal_agent, APPRAISAL_STANDALONE_PROMPT_FS
from agents.chat_agent import create_chat_agent

logger = logging.getLogger(__name__)
# Uvicorn leaves root at WARNING; give our logger its own handler so INFO shows.
if not logger.handlers:
    _h = logging.StreamHandler()
    _h.setFormatter(logging.Formatter("%(levelname)s:     %(name)s: %(message)s"))
    logger.addHandler(_h)
logger.setLevel(logging.INFO)


class _TruncateFilter(logging.Filter):
    """Truncate very long log messages (e.g. full markdown dumps from debug_mode)."""

    def filter(self, record: logging.LogRecord) -> bool:
        msg = record.getMessage()
        if len(msg) > 300:
            record.msg = msg[:300] + f"… [+{len(msg) - 300} chars]"
            record.args = ()
        return True


logging.getLogger("agno").addFilter(_TruncateFilter())


DEFAULT_MODEL_ID = os.getenv("BEDROCK_MODEL_ID", "zai.glm-5")
APPRAISAL_MODEL_ID = os.getenv("APPRAISAL_MODEL_ID", "us.anthropic.claude-sonnet-4-6")

# ── PageIndex (Chat with Doc — self-hosted) ────────────────────────────────────
# Uses the local pageindex/ package. Tree indexing runs via boto3 → Bedrock.
# Model is set in pageindex/config.yaml (default: bedrock/us.anthropic.claude-sonnet-4-6).
# Override with PAGEINDEX_INDEX_MODEL env var if needed.
PAGEINDEX_WORKSPACE = Path("tmp/pageindex_workspace")
PAGEINDEX_PAPERS_DIR = Path("tmp/pageindex_papers")
_pageindex_client = None


def get_pageindex_client():
    """
    Lazily initialise the self-hosted PageIndexClient.
    Workspace is persisted to disk so indexed documents survive server restarts.
    Model resolution order:
      1. PAGEINDEX_INDEX_MODEL env var (explicit override)
      2. pageindex/config.yaml default  (bedrock/us.anthropic.claude-sonnet-4-6)
    AWS credentials are read from the standard env vars already in .env.
    """
    global _pageindex_client
    if _pageindex_client is None:
        from pageindex import PageIndexClient
        PAGEINDEX_WORKSPACE.mkdir(parents=True, exist_ok=True)
        index_model = os.getenv("PAGEINDEX_INDEX_MODEL") or None  # None → use config.yaml default
        _pageindex_client = PageIndexClient(
            workspace=str(PAGEINDEX_WORKSPACE),
            model=index_model,
        )
        logger.info(
            "PageIndex self-hosted client initialised (model=%s, workspace=%s)",
            _pageindex_client.model, PAGEINDEX_WORKSPACE,
        )
    return _pageindex_client


FS_PAPERS_DIR = Path("tmp/papers_fs")

# ── PostgreSQL session storage (Agno/FastAPI) ──────────────────────────────────
AGNO_DB_URL = os.getenv("AGNO_DB_URL")
postgres_db = PostgresDb(db_url=AGNO_DB_URL) if AGNO_DB_URL else None

# ── FileSearch agents ─────────────────────────────────────────────────────────
extraction_agent = create_filesearch_extraction_agent(DEFAULT_MODEL_ID, db=postgres_db)
appraisal_agent = create_filesearch_appraisal_agent(APPRAISAL_MODEL_ID, db=postgres_db)

# ── PageIndex chat agent (registered with AgentOS — uses /agents/pageindex-chat-agent/runs)
chat_agent = create_chat_agent(get_pageindex_client, DEFAULT_MODEL_ID, db=postgres_db)

evidence_team = Team(
    id="fs-evidence-team",
    name="FileSearch Evidence & Appraisal Team",
    model=AwsBedrock(id=DEFAULT_MODEL_ID),
    mode=TeamMode.coordinate,
    members=[extraction_agent, appraisal_agent],
    instructions=[
        "You coordinate a two-step evidence synthesis pipeline using pre-converted markdown files.",
        "The user's message contains the markdown filename(s) to process (e.g. 'study.md').",
        f"Step 1 — Delegate to the FileSearch Extraction Agent. Pass the file path(s) and use this exact prompt:\n{EXTRACTION_PROMPT_FS}",
        f"Step 2 — Delegate to the FileSearch Appraisal Agent. Pass the file path(s) and use this exact prompt:\n{APPRAISAL_STANDALONE_PROMPT_FS}",
        "Step 3 — Combine both outputs into one JSON object. Copy every field verbatim — do NOT rename, drop, or summarise any field. Output ONLY this JSON, no prose, no markdown fences:\n"
        '{"papers": [<exact array from FileSearch Extraction Agent>], "appraisal": {"appraisals": [<exact array from FileSearch Appraisal Agent>]}}',
    ],
    markdown=False,
)

# ── Async pipeline jobs ────────────────────────────────────────────────────────
_pipeline_jobs: dict = {}

# ── Async indexing jobs ────────────────────────────────────────────────────────
_index_jobs: dict = {}

# ── Concurrent pipeline limiter ────────────────────────────────────────────────
# Each pipeline job makes several sequential Bedrock API calls (team coordinator,
# extraction agent, appraisal agent). Allowing too many to run concurrently causes
# AWS Bedrock rate-limit throttling across all users. This semaphore caps the number
# of active pipeline runs; additional jobs wait in the asyncio queue until a slot
# opens. BullMQ already queues jobs durably, so no work is lost.
# Override with the MAX_CONCURRENT_PIPELINES env var (default: 2).
_pipeline_semaphore: asyncio.Semaphore | None = None


def _get_pipeline_semaphore() -> asyncio.Semaphore:
    """Lazily create the semaphore inside the running event loop."""
    global _pipeline_semaphore
    if _pipeline_semaphore is None:
        limit = int(os.getenv("MAX_CONCURRENT_PIPELINES", "2"))
        _pipeline_semaphore = asyncio.Semaphore(limit)
        logger.info("Pipeline concurrency limit set to %d", limit)
    return _pipeline_semaphore


def _serialize_run(node) -> dict:
    """Recursively serialize an Agno RunResponse into a plain JSON-safe dict."""
    if node is None:
        return {}
    # Pydantic v2 model
    if hasattr(node, "model_dump"):
        try:
            return node.model_dump(mode="json", exclude_none=True)
        except Exception:
            pass
    # Fallback: build manually from known fields
    metrics_raw = getattr(node, "metrics", None)
    metrics = None
    if metrics_raw is not None:
        if isinstance(metrics_raw, dict):
            metrics = metrics_raw
        elif hasattr(metrics_raw, "__dict__"):
            metrics = {k: v for k, v in vars(metrics_raw).items() if not k.startswith("_")}

    member_responses = []
    for m in getattr(node, "member_responses", None) or []:
        member_responses.append(_serialize_run(m))

    model = getattr(node, "model", None)
    model_id = model if isinstance(model, str) else getattr(model, "id", None)

    return {
        "content": getattr(node, "content", None) or "",
        "metrics": metrics,
        "model": model_id,
        "agent_id": getattr(node, "agent_id", None),
        "member_responses": member_responses,
    }


async def _run_one_file(
    md_filename: str,
    user_id: str,
    session_id: str,
) -> dict:
    """
    Run the full extraction + appraisal pipeline for a SINGLE markdown file.

    Each call creates its own fresh Team + agent instances and sends a message
    that references only one file. This keeps the agent context window bounded
    to one paper regardless of how many files the user uploaded, preventing
    token-limit failures on large documents.
    """
    job_extraction_agent = create_filesearch_extraction_agent(DEFAULT_MODEL_ID, db=postgres_db)
    job_appraisal_agent = create_filesearch_appraisal_agent(APPRAISAL_MODEL_ID, db=postgres_db)
    file_team = Team(
        id=f"fs-evidence-team-{session_id}-{md_filename}",
        name="FileSearch Evidence & Appraisal Team",
        model=AwsBedrock(id=DEFAULT_MODEL_ID),
        mode=TeamMode.coordinate,
        members=[job_extraction_agent, job_appraisal_agent],
        instructions=[
            "You coordinate a two-step evidence synthesis pipeline using pre-converted markdown files.",
            "The user's message contains the markdown filename to process (e.g. 'study.md').",
            f"Step 1 — Delegate to the FileSearch Extraction Agent. Pass the file path and use this exact prompt:\n{EXTRACTION_PROMPT_FS}",
            f"Step 2 — Delegate to the FileSearch Appraisal Agent. Pass the file path and use this exact prompt:\n{APPRAISAL_STANDALONE_PROMPT_FS}",
            "Step 3 — Combine both outputs into one JSON object. Copy every field verbatim — do NOT rename, drop, or summarise any field. Output ONLY this JSON, no prose, no markdown fences:\n"
            '{"papers": [<exact array from FileSearch Extraction Agent>], "appraisal": {"appraisals": [<exact array from FileSearch Appraisal Agent>]}}',
        ],
        markdown=False,
    )
    single_file_message = (
        f"File: {md_filename}\n\n"
        "Extract structured evidence from this markdown file, "
        "then perform REST quality appraisal on the paper."
    )
    response = await file_team.arun(
        single_file_message,
        user_id=user_id,
        session_id=f"{session_id}-{md_filename}",
        stream=False,
    )
    return _serialize_run(response)


async def _run_pipeline_bg(job_id: str, markdown_files: list[str], user_id: str, session_id: str) -> None:
    """
    Run the evidence pipeline for a job, processing files one-at-a-time.

    WHY sequential, not parallel:
    - Each file's pipeline makes 3+ Bedrock API calls (team + extraction + appraisal).
    - Running N files in parallel = N×3 simultaneous Bedrock calls → rate-limit throttling.
    - Running them sequentially means at most 3 Bedrock calls at a time, regardless of N.
    - Each file's agents only see ONE paper in their context window, so token limits
      can never be hit no matter how large or how many the documents are.

    WHY a semaphore on top of sequential:
    - Multiple users submit jobs concurrently.
    - The semaphore (MAX_CONCURRENT_PIPELINES, default 2) ensures at most 2 users'
      jobs run simultaneously at the FastAPI level. Further jobs wait in asyncio
      without blocking the event loop. BullMQ retains the durable job queue.
    """
    sem = _get_pipeline_semaphore()
    async with sem:
        logger.info(
            "Pipeline job %s: processing %d file(s) concurrently (user=%s)",
            job_id, len(markdown_files), user_id,
        )
        all_papers: list = []
        all_appraisals: list = []
        errors: list[str] = []

        import json, re

        # How many files to process simultaneously within this job.
        # Each file's pipeline calls Bedrock sequentially (team → extraction → appraisal),
        # so FILE_CONCURRENCY=3 means at most ~3 Bedrock calls in-flight at once —
        # one per file, each at a different stage of its own pipeline.
        # Tune via FILE_CONCURRENCY env var if you hit Bedrock rate limits.
        file_concurrency = int(os.getenv("FILE_CONCURRENCY", "3"))
        file_sem = asyncio.Semaphore(file_concurrency)

        def _extract_json(raw: dict) -> dict | None:
            """Pull the first valid JSON block containing 'papers' from a run result."""
            content = raw.get("content", "")
            try:
                d = json.loads(content.strip())
                if "papers" in d:
                    return d
            except Exception:
                pass
            stripped = re.sub(r"```(?:json)?\s*|```", "", content).strip()
            try:
                d = json.loads(stripped)
                if "papers" in d:
                    return d
            except Exception:
                pass
            for member in raw.get("member_responses", []):
                mc = member.get("content", "")
                try:
                    d = json.loads(mc.strip())
                    if "papers" in d:
                        return d
                except Exception:
                    pass
                stripped_mc = re.sub(r"```(?:json)?\s*|```", "", mc).strip()
                try:
                    d = json.loads(stripped_mc)
                    if "papers" in d:
                        return d
                except Exception:
                    pass
            return None

        async def _process_one(i: int, md_filename: str):
            """Process a single file, bounded by file_sem."""
            async with file_sem:
                logger.info(
                    "Pipeline job %s: starting file %d/%d — %s",
                    job_id, i + 1, len(markdown_files), md_filename,
                )
                raw = await _run_one_file(md_filename, user_id, session_id)
                return md_filename, _extract_json(raw)

        # Run all files concurrently (≤ file_concurrency at a time).
        # asyncio.gather preserves input order so results[i] matches markdown_files[i].
        # return_exceptions=True means one file failing never cancels the others.
        outcomes = await asyncio.gather(
            *[_process_one(i, f) for i, f in enumerate(markdown_files)],
            return_exceptions=True,
        )

        for outcome in outcomes:
            if isinstance(outcome, BaseException):
                errors.append(str(outcome))
                logger.error("Pipeline job %s: a file task raised — %s", job_id, outcome)
                continue
            md_filename, parsed = outcome
            if parsed:
                all_papers.extend(parsed.get("papers", []))
                appraisal_node = parsed.get("appraisal", parsed)
                all_appraisals.extend(appraisal_node.get("appraisals", []))
                logger.info(
                    "Pipeline job %s: file %s — extracted %d paper(s), %d appraisal(s)",
                    job_id, md_filename,
                    len(parsed.get("papers", [])),
                    len(appraisal_node.get("appraisals", [])),
                )
            else:
                errors.append(f"{md_filename}: could not parse agent output into structured JSON")
                logger.warning("Pipeline job %s: no parseable JSON for %s", job_id, md_filename)

        # Combine per-file results into the shape the frontend expects
        combined_content = json.dumps({
            "papers": all_papers,
            "appraisal": {"appraisals": all_appraisals},
        })
        combined_result = {
            "content": combined_content,
            "member_responses": [],
        }

        if all_papers or all_appraisals:
            status = "done"
            if errors:
                combined_result["warnings"] = errors
        else:
            status = "error"
            combined_result["error"] = "; ".join(errors) if errors else "No output produced"

        _pipeline_jobs[job_id] = {"status": status, "result": combined_result}
        logger.info(
            "Pipeline job %s finished: %d papers, %d appraisals, %d error(s)",
            job_id, len(all_papers), len(all_appraisals), len(errors),
        )


async def _run_index_bg(job_id: str, pdf_path: str) -> None:
    try:
        client = get_pageindex_client()
        doc_id = await asyncio.to_thread(client.index, pdf_path)
        doc_info = client.documents.get(doc_id, {})
        _index_jobs[job_id] = {
            "status": "done",
            "result": {
                "doc_id": doc_id,
                "filename": doc_info.get("doc_name", Path(pdf_path).name),
                "page_count": doc_info.get("page_count"),
            },
        }
        logger.info("Index job %s done — doc_id=%s", job_id, doc_id)
    except Exception as exc:
        logger.error("Index job %s failed: %s", job_id, exc)
        _index_jobs[job_id] = {"status": "error", "error": str(exc)}


# ── Custom FastAPI app ────────────────────────────────────────────────────────
ROOT_PATH = os.getenv("ROOT_PATH", "/extract-appraise/backend")

app = FastAPI(
    title="REST Evidence Extractor",
    description=(
        "Upload PDFs via POST /upload-fs (converted to markdown via LlamaParse), "
        "then run POST /teams/fs-evidence-team/runs to extract evidence and appraise quality."
    ),
    version="1.0.0",
    root_path=ROOT_PATH,
)

# Dev origins always allowed; production origins come from CORS_ORIGINS env var
# e.g. CORS_ORIGINS=https://your-domain.com,https://www.your-domain.com
_cors_origins = [
    "http://localhost:5173",   # Vite dev server
    "http://localhost:4173",   # Vite preview
    "http://127.0.0.1:5173",
    "http://localhost",        # Docker frontend (port 80)
    "http://localhost:80",
]
_extra = os.getenv("CORS_ORIGINS", "")
if _extra:
    _cors_origins.extend(o.strip() for o in _extra.split(",") if o.strip())

app.add_middleware(
    CORSMiddleware,
    allow_origins=_cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.post("/pipeline/run-async", tags=["Pipeline"])
async def pipeline_run_async(body: dict):
    """Start the pipeline in the background and return a job_id immediately."""
    markdown_files: list[str] = body.get("markdown_files", [])
    user_id: str = body.get("user_id", "")
    session_id: str = body.get("session_id", "")
    if not markdown_files:
        raise HTTPException(status_code=400, detail="markdown_files is required.")
    job_id = str(uuid.uuid4())
    _pipeline_jobs[job_id] = {"status": "running"}
    asyncio.create_task(_run_pipeline_bg(job_id, markdown_files, user_id, session_id))
    return {"job_id": job_id, "status": "running"}


@app.get("/pipeline/job/{job_id}", tags=["Pipeline"])
async def pipeline_job_status(job_id: str):
    """Poll the result of an async pipeline job."""
    job = _pipeline_jobs.get(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found.")
    return job


@app.post("/upload-fs", tags=["FileSearch"])
async def upload_for_filesearch(files: list[UploadFile], user_id: str = Form("")):
    """
    Save uploaded PDFs to disk, convert each to markdown via LlamaParse,
    and save the markdown to tmp/papers_fs_md/ for FileSearch agents to read.
    Conversions run concurrently, bounded by MAX_CONCURRENT_DOCS (default 3).
    """
    if not files:
        raise HTTPException(status_code=400, detail="No files provided.")
    if not LLAMA_CLOUD_API_KEY:
        raise HTTPException(status_code=500, detail="LLAMA_CLOUD_API_KEY not set in .env")

    FS_PAPERS_DIR.mkdir(parents=True, exist_ok=True)
    FS_MARKDOWN_DIR.mkdir(parents=True, exist_ok=True)

    # Concurrency limit — change any time via the MAX_CONCURRENT_DOCS env var (default: 3)
    max_concurrent = int(os.getenv("MAX_CONCURRENT_DOCS", "3"))
    semaphore = asyncio.Semaphore(max_concurrent)

    async def process_file(f: UploadFile):
        """Save one PDF then convert to markdown, respecting the semaphore limit."""
        dest = FS_PAPERS_DIR / f.filename
        file_bytes = await f.read()
        dest.write_bytes(file_bytes)
        saved_path = str(dest.resolve())
        logger.info("Saved for FileSearch: %s", dest)

        stem = Path(f.filename).stem
        prefix = f"{user_id}_" if user_id else ""
        md_filename = f"{prefix}{stem}.md"
        md_path = FS_MARKDOWN_DIR / md_filename

        async with semaphore:
            try:
                logger.info("LlamaParse starting: %s", f.filename)
                markdown = await parse_pdf_to_markdown(saved_path, LLAMA_CLOUD_API_KEY)
                md_path.write_text(markdown, encoding="utf-8")
                logger.info("Markdown saved: %s (%d chars)", md_path, len(markdown))
                return saved_path, md_filename
            except Exception as exc:
                logger.error("LlamaParse failed for %s: %s", f.filename, exc)
                raise HTTPException(
                    status_code=500,
                    detail=f"LlamaParse failed for {f.filename}: {exc}",
                )

    # Kick off all conversions concurrently (≤ max_concurrent active at a time)
    results = await asyncio.gather(*[process_file(f) for f in files])

    saved_paths = [r[0] for r in results]
    markdown_files = [r[1] for r in results]

    return {"files": saved_paths, "markdown_files": markdown_files}



# ── Chat with Doc — document management endpoints ─────────────────────────────
# The chat QUERY is handled by AgentOS at POST /agents/pageindex-chat-agent/runs.
# These three endpoints cover upload/index, listing, and removal only.

@app.post("/chat/index-async", tags=["Chat"])
async def chat_index_document_async(background_tasks: BackgroundTasks, file: UploadFile):
    """Save PDF and start indexing in background. Returns job_id immediately."""
    if not file.filename or not file.filename.lower().endswith(".pdf"):
        raise HTTPException(status_code=400, detail="Only PDF files are supported.")

    PAGEINDEX_PAPERS_DIR.mkdir(parents=True, exist_ok=True)
    pdf_path = PAGEINDEX_PAPERS_DIR / file.filename
    pdf_path.write_bytes(await file.read())

    job_id = str(uuid.uuid4())
    _index_jobs[job_id] = {"status": "running"}
    background_tasks.add_task(_run_index_bg, job_id, str(pdf_path))
    logger.info("Index job %s started for %s", job_id, file.filename)
    return {"job_id": job_id}


@app.get("/chat/index-job/{job_id}", tags=["Chat"])
async def chat_index_job_status(job_id: str):
    """Poll indexing job status. Returns status + result when done."""
    job = _index_jobs.get(job_id)
    if job is None:
        raise HTTPException(status_code=404, detail="Job not found.")
    return job


@app.get("/chat/documents", tags=["Chat"])
async def chat_list_documents():
    """List all documents indexed in the local PageIndex workspace."""
    client = get_pageindex_client()
    docs = [
        {
            "doc_id": doc_id,
            "doc_name": info.get("doc_name", info.get("path", "Unknown")),
            "status": "indexed",
            "page_count": info.get("page_count"),
        }
        for doc_id, info in client.documents.items()
    ]
    return {"documents": docs}


@app.get("/chat/document/{doc_id}", tags=["Chat"])
async def chat_get_document(doc_id: str):
    """Fetch the full indexed document (metadata + tree structure) by doc_id."""
    client = get_pageindex_client()
    if doc_id not in client.documents:
        raise HTTPException(status_code=404, detail="Document not found.")
    client._ensure_doc_loaded(doc_id)
    info = client.documents[doc_id]
    return {
        "doc_id": doc_id,
        "doc_name": info.get("doc_name", info.get("path", "Unknown")),
        "doc_description": info.get("doc_description"),
        "status": "indexed",
        "page_count": info.get("page_count"),
        "type": info.get("type"),
        "structure": info.get("structure"),
    }


@app.delete("/chat/document/{doc_id}", tags=["Chat"])
async def chat_remove_document(doc_id: str):
    """Remove an indexed document from the local PageIndex workspace."""
    client = get_pageindex_client()
    if doc_id not in client.documents:
        raise HTTPException(status_code=404, detail="Document not found.")

    client.documents.pop(doc_id, None)
    for p in PAGEINDEX_WORKSPACE.glob(f"{doc_id}*"):
        p.unlink(missing_ok=True)

    return {"message": f"Document {doc_id} removed."}


# ── AgentOS ───────────────────────────────────────────────────────────────────
agent_os = AgentOS(
    name="REST Evidence Extractor",
    agents=[extraction_agent, appraisal_agent, chat_agent],
    teams=[evidence_team],
    base_app=app,
)

app = agent_os.get_app()


# ── Health check ──────────────────────────────────────────────────────────────
@app.get("/health", include_in_schema=False)
async def health():
    """Lightweight health-check used by Docker / Coolify."""
    return {"status": "ok"}


if __name__ == "__main__":
    agent_os.serve(app="app:app", port=7777)
