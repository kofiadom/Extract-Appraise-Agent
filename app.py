"""
REST Evidence Extractor — powered by AgentOS (FileSearch + LlamaParse)
=======================================================================

Run:
    python app.py               # starts on port 7777
    fastapi dev app.py          # dev mode with hot-reload

AgentOS endpoints:
    POST /agents/fs-extraction-agent/runs    -> Run extraction agent directly
    POST /agents/fs-appraisal-agent/runs     -> Run appraisal agent directly
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
import json
import logging
import os
import re
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
from agno.os import AgentOS

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


_pipeline_jobs: dict = {}

_index_jobs: dict = {}

# ── Concurrent pipeline limiter ────────────────────────────────────────────────
# Each pipeline job can make multiple Bedrock API calls for extraction and appraisal.
# Allowing too many to run concurrently causes
# AWS Bedrock rate-limit throttling across all users. This semaphore caps the number
# of active pipeline runs; additional jobs wait in the asyncio queue until a slot
# opens. BullMQ already queues jobs durably, so no work is lost.
# Override with the MAX_CONCURRENT_PIPELINES env var (default: 3).
_pipeline_semaphore: asyncio.Semaphore | None = None

VALID_PIPELINE_STEPS = {"extraction", "appraisal"}


def _get_pipeline_semaphore() -> asyncio.Semaphore:
    """Lazily create the semaphore inside the running event loop."""
    global _pipeline_semaphore
    if _pipeline_semaphore is None:
        limit = int(os.getenv("MAX_CONCURRENT_PIPELINES", "3"))
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


def _normalize_pipeline_steps(steps) -> list[str]:
    """Validate requested pipeline steps while preserving default behavior."""
    if not steps:
        return ["extraction", "appraisal"]
    if isinstance(steps, str):
        steps = [steps]
    normalized = []
    for step in steps:
        step_name = str(step).strip().lower()
        if step_name not in VALID_PIPELINE_STEPS:
            raise ValueError(f"Invalid pipeline step: {step}")
        if step_name not in normalized:
            normalized.append(step_name)
    if not normalized:
        raise ValueError("At least one pipeline step is required.")
    return normalized


def _json_candidates_from_result(node: dict):
    """Yield possible JSON payloads from a serialized Agno result tree."""
    if not node:
        return
    content = node.get("content", "")
    if isinstance(content, (dict, list)):
        yield content
    elif content:
        yield content
        stripped = re.sub(r"```(?:json)?\s*|```", "", content).strip()
        if stripped != content:
            yield stripped
    for member in node.get("member_responses", []) or []:
        yield from _json_candidates_from_result(member)


def _extract_papers_and_appraisals(node: dict) -> tuple[list, list]:
    """Extract papers/appraisals from any JSON payload in a result tree."""
    papers, appraisals = [], []
    for candidate in _json_candidates_from_result(node):
        try:
            data = candidate if isinstance(candidate, (dict, list)) else json.loads(str(candidate).strip())
        except Exception:
            continue
        if isinstance(data, list):
            continue
        if "papers" in data and isinstance(data["papers"], list):
            papers.extend(data["papers"])
        appraisal_node = data.get("appraisal", data)
        if isinstance(appraisal_node, dict) and isinstance(appraisal_node.get("appraisals"), list):
            appraisals.extend(appraisal_node["appraisals"])
    return papers, appraisals


async def _run_extraction_file(md_filename: str, user_id: str, session_id: str) -> dict:
    """Run the extraction agent directly for one markdown file."""
    agent = create_filesearch_extraction_agent(DEFAULT_MODEL_ID, db=postgres_db)
    message = (
        f"File: {md_filename}\n\n"
        f"{EXTRACTION_PROMPT_FS}"
    )
    response = await agent.arun(
        message,
        user_id=user_id,
        session_id=f"{session_id}-{md_filename}-extraction",
        stream=False,
    )
    return _serialize_run(response)


async def _run_appraisal_file(md_filename: str, user_id: str, session_id: str) -> dict:
    """Run the appraisal agent directly for one markdown file."""
    agent = create_filesearch_appraisal_agent(APPRAISAL_MODEL_ID, db=postgres_db)
    message = (
        f"File: {md_filename}\n\n"
        f"{APPRAISAL_STANDALONE_PROMPT_FS}"
    )
    response = await agent.arun(
        message,
        user_id=user_id,
        session_id=f"{session_id}-{md_filename}-appraisal",
        stream=False,
    )
    return _serialize_run(response)


async def _run_one_file_direct(
    md_filename: str,
    user_id: str,
    session_id: str,
    steps: list[str],
) -> dict:
    """
    Run requested agents for one file.

    Extraction and appraisal are independent Agno agent runs and execute in
    true parallel when both steps are requested.
    """
    runners = []
    if "extraction" in steps:
        runners.append(("extraction", _run_extraction_file(md_filename, user_id, session_id)))
    if "appraisal" in steps:
        runners.append(("appraisal", _run_appraisal_file(md_filename, user_id, session_id)))

    outcomes = await asyncio.gather(*(runner for _, runner in runners), return_exceptions=True)

    papers: list = []
    appraisals: list = []
    member_responses: list = []
    errors: list[str] = []

    for (step, _), outcome in zip(runners, outcomes):
        if isinstance(outcome, BaseException):
            logger.error("Pipeline step failed for %s (%s): %s", md_filename, step, outcome)
            errors.append(f"{step}: {outcome}")
            continue
        member_responses.append(outcome)
        step_papers, step_appraisals = _extract_papers_and_appraisals(outcome)
        papers.extend(step_papers)
        appraisals.extend(step_appraisals)

    if errors and not papers and not appraisals:
        raise RuntimeError("; ".join(errors))

    combined_content = json.dumps({
        "papers": papers,
        "appraisal": {"appraisals": appraisals},
    })
    combined_result = {
        "content": combined_content,
        "member_responses": member_responses,
    }
    if errors:
        combined_result["warnings"] = errors
    return combined_result


async def _run_pipeline_bg(
    job_id: str,
    markdown_files: list[str],
    user_id: str,
    session_id: str,
    steps: list[str] | None = None,
) -> None:
    """
    Run the evidence pipeline for a job, processing files concurrently.

    Each file's result is stored as the FULL _serialize_run output — including
    member_responses, which carry per-agent metrics (tokens, cost). The frontend's
    findParsedResult and sumMetrics traverse this tree and handle everything.

    Multi-user safety:
    - MAX_CONCURRENT_PIPELINES semaphore: caps how many users' jobs run at once.
    - FILE_CONCURRENCY semaphore: caps files processed in parallel within one job.
    - Each file gets fresh agent instances (no shared state).
    """
    sem = _get_pipeline_semaphore()
    steps = _normalize_pipeline_steps(steps)
    async with sem:
        file_concurrency = int(os.getenv("FILE_CONCURRENCY", "3"))
        file_sem = asyncio.Semaphore(file_concurrency)
        logger.info(
            "Pipeline job %s: processing %d file(s), concurrency=%d, steps=%s (user=%s)",
            job_id, len(markdown_files), file_concurrency, steps, user_id,
        )

        async def _process_one(i: int, md_filename: str):
            async with file_sem:
                logger.info(
                    "Pipeline job %s: starting file %d/%d — %s",
                    job_id, i + 1, len(markdown_files), md_filename,
                )
                return md_filename, await _run_one_file_direct(md_filename, user_id, session_id, steps)

        outcomes = await asyncio.gather(
            *[_process_one(i, f) for i, f in enumerate(markdown_files)],
            return_exceptions=True,
        )

        # ── Single file: store the raw result directly ──────────────────────────
        # The frontend's findParsedResult and sumMetrics traverse the full tree,
        # so nothing is lost (member_responses, metrics, content all intact).
        if len(markdown_files) == 1:
            outcome = outcomes[0]
            if isinstance(outcome, BaseException):
                logger.error("Pipeline job %s failed: %s", job_id, outcome)
                _pipeline_jobs[job_id] = {"status": "error", "error": str(outcome)}
            else:
                md_filename, raw = outcome
                # Verify the result has usable content before marking done
                content = raw.get("content", "")
                has_content = bool(content and content.strip())
                # Also check member_responses for content
                if not has_content:
                    for m in raw.get("member_responses", []):
                        if m.get("content", "").strip():
                            has_content = True
                            break
                if has_content:
                    logger.info("Pipeline job %s done — file: %s", job_id, md_filename)
                    _pipeline_jobs[job_id] = {"status": "done", "result": raw}
                else:
                    logger.error("Pipeline job %s: empty result for %s", job_id, md_filename)
                    _pipeline_jobs[job_id] = {"status": "error", "error": f"No content returned for {md_filename}"}
            return

        # ── Multiple files: merge all results ──────────────────────────────────
        # Collect papers + appraisals from each file's result.
        # Also aggregate all member_responses so sumMetrics sees all agent metrics.
        all_papers: list = []
        all_appraisals: list = []
        all_member_responses: list = []
        errors: list[str] = []

        for outcome in outcomes:
            if isinstance(outcome, BaseException):
                errors.append(str(outcome))
                logger.error("Pipeline job %s: a file task raised — %s", job_id, outcome)
                continue
            md_filename, raw = outcome
            papers, appraisals = _extract_papers_and_appraisals(raw)
            all_papers.extend(papers)
            all_appraisals.extend(appraisals)
            all_member_responses.extend(raw.get("member_responses", []))
            logger.info(
                "Pipeline job %s: file %s — %d paper(s), %d appraisal(s)",
                job_id, md_filename, len(papers), len(appraisals),
            )
            if not papers and "extraction" in steps:
                errors.append(f"{md_filename}: no papers extracted")

        combined_content = json.dumps({
            "papers": all_papers,
            "appraisal": {"appraisals": all_appraisals},
        })
        # Preserve all member_responses so sumMetrics can tally tokens/cost
        combined_result = {
            "content": combined_content,
            "member_responses": all_member_responses,
        }

        if all_papers or all_appraisals:
            if errors:
                combined_result["warnings"] = errors
            _pipeline_jobs[job_id] = {"status": "done", "result": combined_result}
        else:
            combined_result["error"] = "; ".join(errors) if errors else "No output produced"
            _pipeline_jobs[job_id] = {"status": "error", "result": combined_result}

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
        "then run POST /pipeline/run-async to extract evidence and appraise quality."
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
    try:
        steps = _normalize_pipeline_steps(body.get("steps"))
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    if not markdown_files:
        raise HTTPException(status_code=400, detail="markdown_files is required.")
    job_id = str(uuid.uuid4())
    _pipeline_jobs[job_id] = {"status": "running"}
    asyncio.create_task(_run_pipeline_bg(job_id, markdown_files, user_id, session_id, steps))
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

        # Markdown already on disk — skip LlamaParse (saves API cost + time on re-uploads)
        if md_path.exists():
            logger.info("Markdown already exists, skipping LlamaParse: %s", md_filename)
            return saved_path, md_filename

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
