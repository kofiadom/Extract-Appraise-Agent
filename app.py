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
    POST   /pipeline/store             -> Store team run results (called by demo UI)
    GET    /pipeline/download/excel    -> Download evidence table (.xlsx)
    GET    /pipeline/download/docx     -> Download quality appraisal (.docx)
    GET    /pipeline/download/json     -> Download full results (.json)
    DELETE /pipeline/reset             -> Clear stored results

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
import tempfile
import uuid
from pathlib import Path

from dotenv import load_dotenv

load_dotenv()

from utils.llamaparse_helper import parse_pdf_to_markdown

LLAMA_CLOUD_API_KEY = os.getenv("LLAMAPARSE_API_KEY", "")
FS_MARKDOWN_DIR = Path("tmp/papers_fs_md")

from fastapi import FastAPI, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response

from agno.models.aws import AwsBedrock
from agno.os import AgentOS
from agno.team import Team
from agno.team.mode import TeamMode

from agents.extraction_agent import create_filesearch_extraction_agent, EXTRACTION_PROMPT_FS
from agents.appraisal_agent import create_filesearch_appraisal_agent, APPRAISAL_STANDALONE_PROMPT_FS
from agents.chat_agent import create_chat_agent
from core.appraisal_schemas import AppraisalResult
from core.schemas import ExtractionResult
from utils.export_appraisal_docx import export_appraisal_to_docx
from utils.export_excel import export_to_excel

logger = logging.getLogger(__name__)

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

# ── FileSearch agents ─────────────────────────────────────────────────────────
extraction_agent = create_filesearch_extraction_agent(DEFAULT_MODEL_ID)
appraisal_agent = create_filesearch_appraisal_agent(APPRAISAL_MODEL_ID)

# ── PageIndex chat agent (registered with AgentOS — uses /agents/pageindex-chat-agent/runs)
chat_agent = create_chat_agent(get_pageindex_client, DEFAULT_MODEL_ID)

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

# ── In-memory state for downloads ─────────────────────────────────────────────
_state: dict = {}

# ── Async pipeline jobs ────────────────────────────────────────────────────────
_pipeline_jobs: dict = {}


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


async def _run_pipeline_bg(job_id: str, message: str) -> None:
    try:
        response = await evidence_team.arun(message, stream=False)
        result = _serialize_run(response)
        _pipeline_jobs[job_id] = {"status": "done", "result": result}
        logger.info("Pipeline job %s done (%d chars)", job_id, len(result.get("content", "")))
    except Exception as exc:
        logger.error("Pipeline job %s failed: %s", job_id, exc)
        _pipeline_jobs[job_id] = {"status": "error", "error": str(exc)}

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
    if not markdown_files:
        raise HTTPException(status_code=400, detail="markdown_files is required.")
    message = (
        f"Files: {', '.join(markdown_files)}\n\n"
        "Extract structured evidence from ALL provided markdown files, "
        "then perform REST quality appraisal on each paper."
    )
    job_id = str(uuid.uuid4())
    _pipeline_jobs[job_id] = {"status": "running"}
    asyncio.create_task(_run_pipeline_bg(job_id, message))
    return {"job_id": job_id, "status": "running"}


@app.get("/pipeline/job/{job_id}", tags=["Pipeline"])
async def pipeline_job_status(job_id: str):
    """Poll the result of an async pipeline job."""
    job = _pipeline_jobs.get(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found.")
    return job


@app.post("/pipeline/store", tags=["Downloads"])
async def store_results(body: dict):
    """
    Store parsed team run results to enable file downloads.
    Called by the demo UI after a successful team run.
    """
    try:
        _state["result"] = ExtractionResult(papers=body.get("papers", []))
        if "appraisal" in body:
            _state["appraisal_result"] = AppraisalResult(**body["appraisal"])
        else:
            _state["appraisal_result"] = None
        return {"message": "Results stored."}
    except Exception as exc:
        raise HTTPException(status_code=422, detail=str(exc))


@app.get("/pipeline/download/excel", tags=["Downloads"])
async def download_excel():
    """Download the evidence table as Excel (REST Table 2 format)."""
    if "result" not in _state:
        raise HTTPException(status_code=404, detail="No results. Run the team first.")
    with tempfile.NamedTemporaryFile(delete=False, suffix=".xlsx") as tmp:
        export_to_excel(_state["result"].papers, output_path=tmp.name)
        xl_bytes = Path(tmp.name).read_bytes()
    return Response(
        content=xl_bytes,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": "attachment; filename=evidence_table.xlsx"},
    )


@app.get("/pipeline/download/docx", tags=["Downloads"])
async def download_docx():
    """Download quality appraisal as Word document (20-criterion REST tool)."""
    if not _state.get("appraisal_result"):
        raise HTTPException(status_code=404, detail="No appraisal results.")
    with tempfile.NamedTemporaryFile(delete=False, suffix=".docx") as tmp:
        export_appraisal_to_docx(_state["appraisal_result"].appraisals, output_path=tmp.name)
        docx_bytes = Path(tmp.name).read_bytes()
    return Response(
        content=docx_bytes,
        media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        headers={"Content-Disposition": "attachment; filename=quality_appraisal.docx"},
    )


@app.get("/pipeline/download/json", tags=["Downloads"])
async def download_json():
    """Download full results (evidence + appraisal) as JSON."""
    if "result" not in _state:
        raise HTTPException(status_code=404, detail="No results.")
    output = _state["result"].model_dump()
    if _state.get("appraisal_result"):
        output["appraisal"] = _state["appraisal_result"].model_dump()
    return Response(
        content=json.dumps(output, indent=2, ensure_ascii=False, default=str),
        media_type="application/json",
        headers={"Content-Disposition": "attachment; filename=evidence_table.json"},
    )


@app.delete("/pipeline/reset", tags=["Downloads"])
async def reset_pipeline():
    """Clear stored results (does not remove uploaded files)."""
    _state.clear()
    return {"message": "Results cleared."}


@app.post("/upload-fs", tags=["FileSearch"])
async def upload_for_filesearch(files: list[UploadFile]):
    """
    Save uploaded PDFs to disk, convert each to markdown via LlamaParse,
    and save the markdown to tmp/papers_fs_md/ for FileSearch agents to read.
    """
    if not files:
        raise HTTPException(status_code=400, detail="No files provided.")
    if not LLAMA_CLOUD_API_KEY:
        raise HTTPException(status_code=500, detail="LLAMA_CLOUD_API_KEY not set in .env")

    FS_PAPERS_DIR.mkdir(parents=True, exist_ok=True)
    FS_MARKDOWN_DIR.mkdir(parents=True, exist_ok=True)

    saved_paths = []
    markdown_files = []

    for f in files:
        # Save the original PDF
        dest = FS_PAPERS_DIR / f.filename
        content = await f.read()
        dest.write_bytes(content)
        saved_paths.append(str(dest.resolve()))
        logger.info("Saved for FileSearch: %s", dest)

        # Convert to markdown via LlamaParse
        stem = Path(f.filename).stem
        md_filename = f"{stem}.md"
        md_path = FS_MARKDOWN_DIR / md_filename
        try:
            markdown = await parse_pdf_to_markdown(str(dest.resolve()), LLAMA_CLOUD_API_KEY)
            md_path.write_text(markdown, encoding="utf-8")
            logger.info("Markdown saved: %s (%d chars)", md_path, len(markdown))
        except Exception as exc:
            logger.error("LlamaParse failed for %s: %s", f.filename, exc)
            raise HTTPException(status_code=500, detail=f"LlamaParse failed for {f.filename}: {exc}")

        markdown_files.append(md_filename)

    return {"files": saved_paths, "markdown_files": markdown_files}


# ── Chat with Doc — document management endpoints ─────────────────────────────
# The chat QUERY is handled by AgentOS at POST /agents/pageindex-chat-agent/runs.
# These three endpoints cover upload/index, listing, and removal only.

@app.post("/chat/index", tags=["Chat"])
async def chat_index_document(file: UploadFile):
    """
    Upload a PDF and index it with self-hosted PageIndex (LiteLLM → Bedrock).
    Builds a hierarchical tree structure — expect 1-3 min for a typical paper.
    Returns the doc_id to pass to POST /agents/pageindex-chat-agent/runs.
    """
    if not file.filename or not file.filename.lower().endswith(".pdf"):
        raise HTTPException(status_code=400, detail="Only PDF files are supported.")

    PAGEINDEX_PAPERS_DIR.mkdir(parents=True, exist_ok=True)
    pdf_path = PAGEINDEX_PAPERS_DIR / file.filename
    pdf_path.write_bytes(await file.read())
    logger.info("Saved PDF for PageIndex indexing: %s", pdf_path)

    try:
        client = get_pageindex_client()
        # client.index() is CPU/IO-bound and can take minutes — run in thread pool
        doc_id = await asyncio.to_thread(client.index, str(pdf_path))
    except Exception as exc:
        logger.error("PageIndex indexing failed: %s", exc)
        raise HTTPException(status_code=500, detail=f"Indexing failed: {exc}")

    doc_info = client.documents.get(doc_id, {})
    return {
        "doc_id": doc_id,
        "filename": file.filename,
        "status": "indexed",
        "page_count": doc_info.get("page_count"),
    }


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
