"""
REST Evidence Extractor — powered by AgentOS (FileSearch + LlamaParse)
=======================================================================

Run:
    python app.py               # starts on port 7777
    fastapi dev app.py          # dev mode with hot-reload

AgentOS endpoints:
    POST /agents/fs-extraction-agent/runs  -> Run extraction agent directly
    POST /agents/fs-appraisal-agent/runs   -> Run appraisal agent directly
    POST /teams/fs-evidence-team/runs      -> Run full pipeline (extract → appraise)

Custom endpoints:
    POST /upload-fs               -> Upload PDFs, convert to markdown via LlamaParse
    POST /pipeline/store          -> Store team run results (called by demo UI)
    GET  /pipeline/download/excel -> Download evidence table (.xlsx)
    GET  /pipeline/download/docx  -> Download quality appraisal (.docx)
    GET  /pipeline/download/json  -> Download full results (.json)
    DELETE /pipeline/reset        -> Clear stored results
"""

import json
import logging
import os
import tempfile
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
from core.appraisal_schemas import AppraisalResult
from core.schemas import ExtractionResult
from utils.export_appraisal_docx import export_appraisal_to_docx
from utils.export_excel import export_to_excel

logger = logging.getLogger(__name__)

DEFAULT_MODEL_ID = os.getenv("BEDROCK_MODEL_ID", "zai.glm-5")

FS_PAPERS_DIR = Path("tmp/papers_fs")

# ── FileSearch agents ─────────────────────────────────────────────────────────
extraction_agent = create_filesearch_extraction_agent(DEFAULT_MODEL_ID)
appraisal_agent = create_filesearch_appraisal_agent(DEFAULT_MODEL_ID)

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

# ── Custom FastAPI app ────────────────────────────────────────────────────────
app = FastAPI(
    title="REST Evidence Extractor",
    description=(
        "Upload PDFs via POST /upload-fs (converted to markdown via LlamaParse), "
        "then run POST /teams/fs-evidence-team/runs to extract evidence and appraise quality."
    ),
    version="1.0.0",
)

# Dev origins always allowed; production origins come from CORS_ORIGINS env var
# e.g. CORS_ORIGINS=https://your-domain.com,https://www.your-domain.com
_cors_env = os.getenv("CORS_ORIGINS", "")
if _cors_env.strip() == "*":
    # Wildcard — allow all origins (useful for Coolify PoC deployments)
    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_credentials=False,   # credentials + wildcard not allowed by spec
        allow_methods=["*"],
        allow_headers=["*"],
    )
else:
    _cors_origins = [
        "http://localhost:5173",   # Vite dev server
        "http://localhost:4173",   # Vite preview
        "http://127.0.0.1:5173",
        "http://localhost",        # Docker frontend (port 80)
        "http://localhost:80",
    ]
    if _cors_env:
        _cors_origins.extend(o.strip() for o in _cors_env.split(",") if o.strip())
    app.add_middleware(
        CORSMiddleware,
        allow_origins=_cors_origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )


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


# ── AgentOS ───────────────────────────────────────────────────────────────────
agent_os = AgentOS(
    name="REST Evidence Extractor",
    agents=[extraction_agent, appraisal_agent],
    teams=[evidence_team],
    base_app=app,
)

app = agent_os.get_app()


# ── Health check (registered on the final app after AgentOS wrapping) ─────────
@app.get("/health", include_in_schema=False)
async def health():
    """Lightweight health-check used by Docker / Coolify."""
    return {"status": "ok"}


# ── Override OpenAPI schema generation to catch errors ─────────────────────────
_original_openapi = app.openapi

def _safe_openapi():
    try:
        return _original_openapi()
    except Exception as exc:
        logger.error("OpenAPI schema generation failed: %s", exc)
        return {
            "openapi": "3.1.0",
            "info": {"title": "REST Evidence Extractor", "version": "1.0.0"},
            "paths": {},
        }

app.openapi = _safe_openapi


if __name__ == "__main__":
    agent_os.serve(app="app:app", port=7777)
