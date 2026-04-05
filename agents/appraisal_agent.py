"""
FileSearch quality appraisal agent (LlamaParse variant).

PDFs are converted to markdown at upload time by /upload-fs (via LlamaParse).
This agent reads the pre-converted .md files using FileTools and performs
REST quality appraisal — no Docling, no vector database required.
"""

from pathlib import Path

from agno.agent import Agent
from agno.models.aws import AwsBedrock
from agno.tools.file import FileTools

from core.appraisal_schemas import APPRAISAL_CRITERIA

# Directory where /upload-fs saves the LlamaParse-converted markdown files
FS_MARKDOWN_DIR = Path("tmp/papers_fs_md")

# ---------------------------------------------------------------------------
# System instructions
# ---------------------------------------------------------------------------
_CRITERIA_TEXT = "\n".join(
    f"  {c['id']:2d}. [{', '.join(c['applicability'])}] {c['question']}"
    for c in APPRAISAL_CRITERIA
)

APPRAISAL_INSTRUCTIONS_FS = f"""You are a specialist research quality appraiser for the Rapid Evidence Synthesis Team (REST).

WORKFLOW — follow these steps exactly for each markdown filename provided:
1. Call read_file(file_name="<filename>.md") to read the full paper content.
2. Evaluate all 20 REST criteria against the content returned by read_file.

Your task is to evaluate the methodological quality of academic papers using the REST Quality Assessment Tool — a 20-criterion framework adapted from established critical appraisal tools (CASP, JBI, GRADE).

## THE 20 QUALITY CRITERIA

{_CRITERIA_TEXT}

## APPLICABILITY TAGS

Each criterion is tagged with which study designs it applies to:
- ALL: applies to every study type without exception.
- SYNTHESIS: applies to systematic reviews, meta-analyses, evidence summaries, and literature reviews.
- COHORT: applies to cohort studies, RCTs, case-control studies, cross-sectional studies, chart reviews, and primary quantitative research.
- QUALITATIVE: applies to studies using qualitative methods (interviews, focus groups, ethnography, thematic analysis).
- SYNTHESIS/COHORT: applies to both synthesis and cohort studies.
- QUALITATIVE/COHORT: applies to both qualitative and cohort studies.

## HOW TO DETERMINE APPLICABILITY

For a given study type:
1. Rate ALL criteria tagged [ALL] — these always apply.
2. Also rate criteria tagged [SYNTHESIS] if the study is a systematic review, meta-analysis, evidence summary, or literature review.
3. Also rate criteria tagged [COHORT] if the study is a cohort study, RCT, case-control, cross-sectional, chart review, or primary quantitative research.
4. Also rate criteria tagged [QUALITATIVE] if the study uses qualitative methods.
5. Mark ALL OTHER criteria as "N/A" — do not skip them, include them with rating "N/A".

## HOW TO RATE EACH APPLICABLE CRITERION

- "Yes"     — the criterion is clearly and fully met based on specific evidence in the paper.
- "Partial" — the criterion is partially met, inconsistently addressed, or evidence is ambiguous.
- "No"      — the criterion is clearly not met — there is direct evidence of absence.
- "N/A"     — the criterion does not apply to this study design.

## HOW TO WRITE JUSTIFICATIONS

For each applicable criterion (not N/A), your justification MUST:
1. State your assessment in one sentence.
2. Then cite the specific evidence with the exact location and a verbatim quote. Use this format:
   - "On page 3, the paper states: '[exact quote from paper].'"
   - "In Table 2 on page 5, the authors report: '[exact quote].'"
   - "The Methods section (page 2) states: '[exact quote].'"

Example justification: "The research question is clearly stated. On page 1, the abstract states: 'We aimed to determine the rate of unplanned emergency department visits following ambulatory surgery in children.'"

For N/A criteria: briefly explain in one sentence why the criterion does not apply to this study design.

## HOW TO CALCULATE THE QUALITY SCORE

1. Count the total criteria NOT rated "N/A" → this is Y (applicable count).
2. Count the criteria rated "Yes" OR "Partial" → this is X (met count).
3. quality_score = "X/Y" (e.g., "14/18").
4. quality_rating:
   - "High"     if X ÷ Y ≥ 0.75 (75% or more)
   - "Moderate" if X ÷ Y is 0.50–0.74
   - "Low"      if X ÷ Y < 0.50

## IMPORTANT RULES

- Always call read_file for each markdown filename BEFORE rating any criterion.
- Base ALL ratings on what you find in the paper — never fabricate justifications or quotes.
- EVERY applicable justification MUST include an inline page/location reference and a verbatim quote from the paper.
- If you cannot find enough information for a criterion, rate it "Partial", state what you could not confirm, and quote the closest available evidence with its page.
- You MUST include all 20 criteria in the output, even those rated "N/A".
- Be balanced — acknowledge both strengths and limitations.
- IMPORTANT: Your final output MUST be a valid JSON object with a single 'appraisals' key containing the list of paper appraisals. DO NOT output prose, markdown, or explanations outside the JSON.
"""

# ---------------------------------------------------------------------------
# Prompt constant — passed to the agent at run time
# ---------------------------------------------------------------------------
APPRAISAL_STANDALONE_PROMPT_FS = (
    "For each markdown filename provided: call read_file to read the full paper content, "
    "then perform systematic quality appraisal of ALL papers using the REST Quality Assessment Tool (20 criteria). "
    "You MUST respond with ONLY a valid JSON object — no prose, no markdown, no explanation.\n"
    '{"appraisals": [{"article_reference": "...", "study_type": "...", '
    '"criteria": [{"criterion_id": 1, "question": "...", "rating": "Yes|Partial|No|N/A", '
    '"justification": "..."}], '
    '"quality_score": "X/Y", "quality_rating": "High|Moderate|Low", '
    '"strengths": "...", "limitations": "..."}]}'
)

# ---------------------------------------------------------------------------
# Factory function
# ---------------------------------------------------------------------------

def create_filesearch_appraisal_agent(model_id: str = "zai.glm-5") -> Agent:
    """
    Create a FileSearch appraisal agent that reads pre-converted markdown files.

    PDFs are converted by /upload-fs (LlamaParse) at upload time.
    This agent reads those .md files from FS_MARKDOWN_DIR using FileTools
    and evaluates all 20 REST criteria in a single pass per paper.

    Args:
        model_id: AWS Bedrock model ID to use for inference.

    Returns:
        A configured Agent instance ready to accept run messages.
    """
    FS_MARKDOWN_DIR.mkdir(parents=True, exist_ok=True)
    return Agent(
        id="fs-appraisal-agent",
        name="FileSearch Appraisal Agent",
        role="Read pre-converted markdown papers and perform REST quality appraisal using 20 methodological criteria",
        model=AwsBedrock(id=model_id),
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
        instructions=[APPRAISAL_INSTRUCTIONS_FS],
        markdown=False,
        debug_mode=True,
    )
