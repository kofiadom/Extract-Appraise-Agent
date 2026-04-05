"""
REST Evidence Extractor — PoC Demo UI
======================================
Thin Streamlit front-end that talks to the agentos_app.py API.

Start the backend first:
    python agentos_app.py          (port 7777)

Then run this UI:
    streamlit run demo.py
"""

import json
import logging
import os
import re
import sys
import time

import requests
import streamlit as st
from dotenv import load_dotenv

load_dotenv()

# USD per 1M tokens — AWS Bedrock, US East (N. Virginia)
MODEL_PRICING: dict[str, dict[str, float]] = {
    "zai.glm-5":                   {"input": 1.00,  "output": 3.20},
    "moonshotai.kimi-k2.5":        {"input": 0.14,  "output": 0.59},
    "anthropic.claude-sonnet-4-6": {"input": 3.00,  "output": 15.00},
    "minimax.minimax-m2.5":        {"input": 0.40,  "output": 1.20},
}

# ── Terminal logging (visible in the terminal where `streamlit run demo.py` runs) ──
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    datefmt="%H:%M:%S",
    handlers=[logging.StreamHandler(sys.stdout)],
)
logger = logging.getLogger("demo")

AGENT_METHOD = os.getenv("AGENT_METHOD", "rag").lower()

# ── Config ────────────────────────────────────────────────────────────────────
st.set_page_config(
    page_title="REST Evidence Extractor",
    page_icon="🔬",
    layout="wide",
    initial_sidebar_state="expanded",
)
st.markdown("<style>#MainMenu{visibility:hidden}footer{visibility:hidden}</style>",
            unsafe_allow_html=True)


# ── Sidebar ───────────────────────────────────────────────────────────────────
with st.sidebar:
    st.title("REST Extractor")
    st.divider()
    api_base = st.text_input("API base URL", value="http://localhost:7777")
    api_base = api_base.rstrip("/")
    st.caption(f"Agent method: **{AGENT_METHOD.upper()}**")
    st.divider()
    if st.button("Reset", use_container_width=True):
        try:
            requests.delete(f"{api_base}/pipeline/reset", timeout=5)
        except Exception:
            pass
        st.session_state.clear()
        st.rerun()


# ── Header ────────────────────────────────────────────────────────────────────
st.title("🔬 REST Evidence Extractor")
st.caption("Upload academic papers → extract structured evidence → quality appraisal.")
st.divider()


# ── Step 1: Select files ──────────────────────────────────────────────────────
uploaded_files = st.file_uploader(
    "Select PDF papers",
    type=["pdf"],
    accept_multiple_files=True,
)

uploaded_done = st.session_state.get("uploaded_done", False)

_upload_label = "📤 Upload Papers" if AGENT_METHOD == "filesearch" else "📤 Upload to Knowledge Base"

if st.button(_upload_label, type="secondary",
             disabled=not uploaded_files, use_container_width=True):

    st.session_state.pop("uploaded_done", None)
    step = st.empty()

    if AGENT_METHOD == "filesearch":
        # FileSearch mode: POST all files in one request to /upload-fs
        step.info(f"Uploading {len(uploaded_files)} file(s) for FileSearch…")
        logger.info("Uploading %d file(s) to %s/upload-fs", len(uploaded_files), api_base)
        try:
            files_payload = [
                ("files", (f.name, f.read(), "application/pdf"))
                for f in uploaded_files
            ]
            resp = requests.post(
                f"{api_base}/upload-fs",
                files=files_payload,
                timeout=300,
            )
            resp.raise_for_status()
            saved_paths = resp.json().get("files", [])
            markdown_files = resp.json().get("markdown_files", [])
            logger.info("FileSearch upload complete. Markdown files: %s", markdown_files)
            st.session_state["fs_file_paths"] = saved_paths
            st.session_state["fs_markdown_files"] = markdown_files
        except requests.HTTPError as exc:
            detail = exc.response.json().get("detail", exc.response.text) if exc.response else str(exc)
            step.error(f"Upload failed: {detail}")
            logger.error("FileSearch upload failed: %s | detail: %s", exc, detail)
            st.stop()
        except Exception as exc:
            step.error(f"Upload failed: {exc}")
            logger.error("FileSearch upload failed: %s", exc)
            st.stop()

        step.success(f"✅ {len(uploaded_files)} paper(s) saved and ready for FileSearch.")
        st.session_state["uploaded_done"] = True
        uploaded_done = True

    else:
        # RAG mode: upload each file individually to /knowledge/content with status polling
        for i, f in enumerate(uploaded_files, 1):
            # Submit file
            step.info(f"Uploading {i}/{len(uploaded_files)}: {f.name}…")
            logger.info("Uploading %s to %s/knowledge/content", f.name, api_base)
            try:
                resp = requests.post(
                    f"{api_base}/knowledge/content",
                    files={"file": (f.name, f.read(), "application/pdf")},
                    timeout=120,
                )
                resp.raise_for_status()
                content_id = resp.json().get("id")
                logger.info("Submitted %s — content_id=%s", f.name, content_id)
            except Exception as exc:
                step.error(f"Upload failed for {f.name}: {exc}")
                logger.error("Upload failed: %s", exc)
                st.stop()
            finally:
                f.seek(0)

            # Poll until processed
            if content_id:
                step.info(f"Processing {i}/{len(uploaded_files)}: {f.name}…")
                for _ in range(120):  # up to 120 s
                    time.sleep(1)
                    try:
                        s = requests.get(
                            f"{api_base}/knowledge/content/{content_id}/status",
                            timeout=10,
                        )
                        status = s.json().get("status", "processing")
                        logger.info("Status %s → %s", content_id, status)
                        if status == "completed":
                            break
                        if status == "failed":
                            step.error(f"Processing failed for {f.name}.")
                            logger.error("Processing failed: content_id=%s", content_id)
                            st.stop()
                    except Exception:
                        pass

        step.success(f"✅ {len(uploaded_files)} paper(s) indexed and ready.")
        st.session_state["uploaded_done"] = True
        uploaded_done = True

st.write("")


# ── Step 2: Run team ──────────────────────────────────────────────────────────
if st.button("⚡ Extract & Appraise", type="primary",
             disabled=not uploaded_done, use_container_width=True):

    step = st.empty()
    _t0 = time.monotonic()

    if AGENT_METHOD == "filesearch":
        team_id = "fs-evidence-team"
        markdown_files = st.session_state.get("fs_markdown_files", [])
        message = (
            f"Files: {', '.join(markdown_files)}\n\n"
            "Extract structured evidence from ALL provided markdown files, "
            "then perform REST quality appraisal on each paper."
        )
    else:
        team_id = "evidence-team"
        message = "Extract structured evidence from all uploaded papers, then perform REST quality appraisal on each paper."

    step.info("⚙️ Running evidence team (extraction → appraisal). This may take a few minutes…")
    logger.info("POST %s/teams/%s/runs", api_base, team_id)
    try:
        resp = requests.post(
            f"{api_base}/teams/{team_id}/runs",
            data={
                "message": message,
                "stream": "false",
                "monitor": "false",
            },
            timeout=600,
        )
        resp.raise_for_status()
        team_response = resp.json()
        logger.info("Team run complete. Parsing response…")
    except Exception as exc:
        step.error(f"Team run failed: {exc}")
        logger.error("Team run error: %s", exc)
        st.stop()

    # ── Step 3: Parse JSON from team response content ─────────────────────────
    content = team_response.get("content", "") or ""
    data = None

    # Try direct JSON parse first, then extract from embedded JSON block
    for candidate in [content, re.sub(r"^```(?:json)?\s*|\s*```$", "", content, flags=re.DOTALL)]:
        try:
            parsed = json.loads(candidate.strip())
            if isinstance(parsed, dict) and "papers" in parsed:
                data = parsed
                break
        except (json.JSONDecodeError, ValueError):
            pass

    # Fallback: find first { ... } block
    if data is None:
        start = content.find("{")
        if start != -1:
            depth, end = 0, -1
            for i, ch in enumerate(content[start:], start):
                depth += (ch == "{") - (ch == "}")
                if depth == 0:
                    end = i
                    break
            if end != -1:
                try:
                    data = json.loads(content[start:end + 1])
                except (json.JSONDecodeError, ValueError):
                    pass

    if not data or not data.get("papers"):
        step.error("Could not parse structured results from team response. Check agent logs.")
        logger.error("Raw team content: %s", content[:500])
        st.stop()

    logger.info("Parsed %d paper(s), %d appraisal(s)",
                len(data.get("papers", [])),
                len(data.get("appraisal", {}).get("appraisals", [])))

    # ── Step 4: Store results on server (enables downloads) ───────────────────
    try:
        requests.post(f"{api_base}/pipeline/store", json=data, timeout=30).raise_for_status()
    except Exception as exc:
        logger.warning("Could not store results for downloads: %s", exc)

    elapsed = time.monotonic() - _t0
    step.success(f"✅ Extraction and appraisal complete! (total: {elapsed:.1f}s)")
    logger.info("Total wall-clock time: %.1fs", elapsed)

    # ── Step 5: Aggregate token / cost metrics across team + all members ─────
    def _sum_metrics(node: dict) -> dict:
        """Recursively sum input/output/total tokens and cost from a run node."""
        m = node.get("metrics") or {}
        totals = {
            "input_tokens":  m.get("input_tokens", 0) or 0,
            "output_tokens": m.get("output_tokens", 0) or 0,
            "total_tokens":  m.get("total_tokens", 0) or 0,
            "cost_usd":      m.get("cost") or 0.0,
            "duration_s":    m.get("duration"),
        }
        for member in node.get("member_responses") or []:
            child = _sum_metrics(member)
            totals["input_tokens"]  += child["input_tokens"]
            totals["output_tokens"] += child["output_tokens"]
            totals["total_tokens"]  += child["total_tokens"]
            totals["cost_usd"]      += child["cost_usd"]
        return totals

    stats = _sum_metrics(team_response)

    # Compute cost from pricing table if not returned by the API
    if not stats["cost_usd"]:
        model_id = team_response.get("model") or ""
        pricing = MODEL_PRICING.get(model_id, {})
        if pricing and stats["total_tokens"] > 0:
            stats["cost_usd"] = (
                stats["input_tokens"]  * pricing["input"] +
                stats["output_tokens"] * pricing["output"]
            ) / 1_000_000
            logger.info("Cost computed from pricing table for model: %s", model_id)
        else:
            stats["cost_usd"] = None

    logger.info("Aggregated tokens — in: %s  out: %s  total: %s  cost: %s",
                stats["input_tokens"], stats["output_tokens"],
                stats["total_tokens"], stats["cost_usd"])

    st.session_state["data"] = data
    st.session_state["stats"] = stats
    st.session_state["elapsed"] = elapsed
    st.session_state["api_base"] = api_base


# ── Results ───────────────────────────────────────────────────────────────────
if "data" not in st.session_state:
    st.stop()

data: dict = st.session_state["data"]
api_base: str = st.session_state["api_base"]

papers = data.get("papers", [])
appraisals = data.get("appraisal", {}).get("appraisals", [])
stats = st.session_state.get("stats", {})
elapsed = st.session_state.get("elapsed")

# Summary metrics
c1, c2, c3, c4, c5 = st.columns(5)
c1.metric("Papers extracted", len(papers))
c2.metric("Papers appraised", len(appraisals))
c3.metric("Total tokens", f"{stats.get('total_tokens', 0):,}" or "—")
c4.metric("Est. cost (USD)", f"${stats['cost_usd']:.5f}" if stats.get("cost_usd") else "N/A")
c5.metric("Total time", f"{elapsed:.1f}s" if elapsed is not None else "—")

st.divider()

tab_ev, tab_ap, tab_dl = st.tabs([
    f"📋 Evidence ({len(papers)})",
    f"🔍 Appraisal ({len(appraisals)})",
    "💾 Download",
])


# ── Tab 1: Evidence ───────────────────────────────────────────────────────────
with tab_ev:
    if not papers:
        st.info("No evidence extracted.")
    for i, paper in enumerate(papers):
        with st.expander(f"Paper {i + 1} — {paper.get('article_reference', '')}", expanded=True):
            fields = [
                ("Country",          paper.get("country", "—")),
                ("Study Design",     paper.get("study_type", "—")),
                ("Population",       paper.get("population", "—")),
                ("Setting",          paper.get("setting", "—")),
                ("Peer Reviewed",    paper.get("peer_reviewed", "—")),
                ("Intervention",     paper.get("intervention", "—")),
                ("Primary Results",  paper.get("primary_results", "—")),
            ]
            for label, value in fields:
                st.markdown(f"**{label}:** {value}")

            if paper.get("additional_findings"):
                st.markdown(f"**Additional Findings:** {paper['additional_findings']}")


# ── Tab 2: Appraisal ─────────────────────────────────────────────────────────
RATING_BADGE = {"Yes": "✅ Yes", "Partial": "⚠️ Partial", "No": "❌ No", "N/A": "— N/A"}

with tab_ap:
    if not appraisals:
        st.info("No appraisal results available.")
    for i, appraisal in enumerate(appraisals):
        with st.expander(
            f"Paper {i + 1} — {appraisal.get('article_reference', '')}",
            expanded=True,
        ):
            st.markdown(
                f"**Study design:** {appraisal.get('study_type', '—')} &nbsp;|&nbsp; "
                f"**Score:** {appraisal.get('quality_score', '—')} &nbsp;|&nbsp; "
                f"**Rating:** {appraisal.get('quality_rating', '—')}"
            )
            st.divider()

            criteria = appraisal.get("criteria", [])
            for c in criteria:
                badge = RATING_BADGE.get(c.get("rating", ""), c.get("rating", ""))
                st.markdown(
                    f"**{c.get('criterion_id', '')}. {c.get('question', '')}**  \n"
                    f"{badge} — {c.get('justification', '')}"
                )

            st.divider()
            st.markdown(f"**Strengths:** {appraisal.get('strengths', '—')}")
            st.markdown(f"**Limitations:** {appraisal.get('limitations', '—')}")


# ── Tab 3: Download ───────────────────────────────────────────────────────────
with tab_dl:
    st.subheader("Export Results")
    col1, col2, col3 = st.columns(3)

    with col1:
        try:
            r = requests.get(f"{api_base}/pipeline/download/excel", timeout=30)
            r.raise_for_status()
            st.download_button(
                "📗 Evidence Table (.xlsx)",
                data=r.content,
                file_name="evidence_table.xlsx",
                mime="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                use_container_width=True,
            )
        except Exception:
            st.button("📗 Evidence Table (.xlsx)", disabled=True, use_container_width=True)
        st.caption("REST Table 2 format.")

    with col2:
        try:
            r = requests.get(f"{api_base}/pipeline/download/docx", timeout=30)
            r.raise_for_status()
            st.download_button(
                "📝 Quality Appraisal (.docx)",
                data=r.content,
                file_name="quality_appraisal.docx",
                mime="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
                use_container_width=True,
            )
        except Exception:
            st.button("📝 Quality Appraisal (.docx)", disabled=True, use_container_width=True)
        st.caption("20-criterion REST appraisal.")

    with col3:
        st.download_button(
            "📄 Full Data (.json)",
            data=json.dumps(data, indent=2, ensure_ascii=False, default=str),
            file_name="evidence_table.json",
            mime="application/json",
            use_container_width=True,
        )
        st.caption("All fields including appraisal.")
