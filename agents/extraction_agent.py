"""
FileSearch extraction agent (LlamaParse variant).

PDFs are converted to markdown at upload time by /upload-fs (via LlamaParse).
This agent reads the pre-converted .md files using FileTools and extracts
structured evidence — no Docling, no vector database required.
"""

from pathlib import Path

from agno.agent import Agent
from agno.models.aws import AwsBedrock
from agno.tools.file import FileTools

from core.schemas import VALID_STUDY_TYPES

# Directory where /upload-fs saves the LlamaParse-converted markdown files
FS_MARKDOWN_DIR = Path("tmp/papers_fs_md")

# ---------------------------------------------------------------------------
# System instructions
# ---------------------------------------------------------------------------
STUDY_TYPE_LIST = "\n".join(f"  - {st}" for st in VALID_STUDY_TYPES)

EXTRACTION_INSTRUCTIONS_FS = f"""You are a specialist evidence extractor for the Rapid Evidence Synthesis Team (REST).

WORKFLOW — follow these steps exactly for each markdown filename provided:
1. Call read_file(file_name="<filename>.md") to read the full paper content.
2. Extract ALL required fields from the content returned by read_file.

Your task is to extract structured information from academic papers.
For each paper, you MUST extract ALL of the following fields:

1. **Article Reference**: Full citation in NLM/Vancouver format.
   Include authors, title, journal, year, volume, pages, DOI.

2. **Country**: Where the study was conducted.

3. **Study Design**: MUST be one of these exact values:
{STUDY_TYPE_LIST}

4. **Population**: The study population — keep to 1 short sentence covering age group, condition, and sample size only (e.g. "Children aged 0-17 years (n=83,468) with ambulatory surgery in Ontario, 2014-2018").

5. **Setting**: 1 short sentence: the care setting and location only (e.g. "Ambulatory surgery centres in Ontario, Canada").

6. **Peer Reviewed**: "Yes" or "No".

7. **Intervention**: "Yes" or "No" — whether a treatment, procedure, or therapeutic intervention was applied to participants during the study.

8. **Primary Results**: The most important outcome measures and results.
   Include key statistics (effect sizes, confidence intervals, p-values, odds ratios).

9. **Additional Findings**: Any secondary findings of interest to decision-makers.
    If none, leave empty.

IMPORTANT RULES:
- Always call read_file for each markdown filename BEFORE extracting fields.
- Extract information ONLY from what is in the paper — do not fabricate data.
- If a field cannot be determined from the paper, write "Not reported".
- Be thorough but concise — decision-makers will read this. Don't be too wordy.
- If multiple markdown files are provided, process and extract evidence for EACH paper separately.
- IMPORTANT: Your final output MUST be a valid JSON object with a single 'papers' key containing the list of extracted evidence. DO NOT output a raw list.
"""

# ---------------------------------------------------------------------------
# Prompt constant — passed to the agent at run time
# ---------------------------------------------------------------------------
EXTRACTION_PROMPT_FS = (
    "For each markdown filename provided: call read_file to read the full paper content, "
    "then extract structured evidence from ALL papers. "
    "You MUST respond with ONLY a valid JSON object — no prose, no markdown, no explanation. "
    "The JSON must match this exact structure:\n"
    '{"papers": [{'
    '"article_reference": "...", '
    '"country": "...", '
    '"study_type": "...", '
    '"population": "...", '
    '"setting": "...", '
    '"peer_reviewed": "Yes or No", '
    '"intervention": "Yes or No", '
    '"primary_results": "...", '
    '"additional_findings": "..."'
    "}]}"
)

# ---------------------------------------------------------------------------
# Factory function
# ---------------------------------------------------------------------------

def create_filesearch_extraction_agent(model_id: str = "zai.glm-5", db=None) -> Agent:
    """
    Create a FileSearch extraction agent that reads pre-converted markdown files.

    PDFs are converted by /upload-fs (LlamaParse) at upload time.
    This agent reads those .md files from FS_MARKDOWN_DIR using FileTools
    and extracts all evidence fields in a single pass per paper.

    Args:
        model_id: AWS Bedrock model ID to use for inference.
        db:       Optional Agno storage backend (e.g. PostgresDb) for session history.

    Returns:
        A configured Agent instance ready to accept run messages.
    """
    FS_MARKDOWN_DIR.mkdir(parents=True, exist_ok=True)
    return Agent(
        id="fs-extraction-agent",
        name="FileSearch Extraction Agent",
        role="Read pre-converted markdown papers and extract structured evidence",
        model=AwsBedrock(id=model_id, max_tokens=32000),
        tools=[
            FileTools(
                base_dir=FS_MARKDOWN_DIR,
                enable_read_file=True,
                enable_save_file=False,
                enable_delete_file=False,
                enable_read_file_chunk=False,
                enable_replace_file_chunk=False,
                enable_list_files=False,
                enable_search_content=False,
            ),
        ],
        instructions=[EXTRACTION_INSTRUCTIONS_FS],
        markdown=False,
        debug_mode=True,
        db=db,
        update_memory_on_run=False,
    )
