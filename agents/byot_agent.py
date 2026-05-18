"""
BYOT (Bring Your Own Template) agent.

Reads user-uploaded template documents (converted to markdown by LlamaParse)
and extracts structured extraction fields and appraisal criteria from them.
The resulting ByotReviewResult JSON is presented to the user for approval,
then injected into the extraction and appraisal agents at pipeline runtime.
"""

from pathlib import Path

from agno.agent import Agent
from agno.models.aws import AwsBedrock
from agno.tools.file import FileTools

BYOT_MARKDOWN_DIR = Path("tmp/byot_templates_md")

BYOT_INSTRUCTIONS = """You are a template analysis assistant for the Rapid Evidence Synthesis Team (REST).

WORKFLOW — follow these steps exactly:
1. Call read_file for EACH template filename provided to read its content.
2. Analyse the content of each file to identify custom extraction fields and appraisal criteria.

Your task is to parse template documents and return a structured JSON object describing:
1. Extraction fields — what information to extract from research papers
2. Appraisal criteria — how to evaluate research paper quality

## FOR EXTRACTION FIELDS

Identify each field the template defines and extract:
- name: Short field label (title-cased, e.g. "Study Population")
- description: What this field captures (1-2 sentences)
- instructions: Exactly how to extract it from a research paper (specific, actionable guidance)
- required: true if the field is mandatory, false if optional

## FOR APPRAISAL CRITERIA

Identify each criterion and extract:
- name: Short criterion label (e.g. "Clear Research Question")
- description: What aspect of quality is being assessed (1-2 sentences)
- applicability: Which study types it applies to. Use one or more of:
  - "ALL" — applies to every study type without exception
  - "COHORT" — cohort studies, RCTs, case-control, cross-sectional, chart reviews
  - "SYNTHESIS" — systematic reviews, meta-analyses, evidence summaries, literature reviews
  - "QUALITATIVE" — qualitative studies (interviews, focus groups, ethnography, thematic analysis)
  If the template does not specify applicability, default to ["ALL"].
- rating_scale: Valid rating options. Default to ["Yes", "Partial", "No", "N/A"] unless the template specifies otherwise.
- instructions: How to rate this criterion (what constitutes Yes, Partial, No)

## IMPORTANT RULES

- Always call read_file for each filename BEFORE analysing.
- Extract information ONLY from the template content — do not add fields or criteria not described.
- If a field/criterion is ambiguous, make a reasonable inference and include it.
- Your final output MUST be a valid JSON object with NO extra prose, markdown, or explanation.

The JSON must match this exact structure:
{
  "extraction": {
    "fields": [
      {
        "name": "Field Name",
        "description": "...",
        "instructions": "...",
        "required": true
      }
    ]
  },
  "appraisal": {
    "criteria": [
      {
        "name": "Criterion Name",
        "description": "...",
        "applicability": ["ALL"],
        "rating_scale": ["Yes", "Partial", "No", "N/A"],
        "instructions": "..."
      }
    ]
  }
}
"""

BYOT_PROMPT_TEMPLATE = (
    "Template files provided: {filenames}\n\n"
    "Read each file using read_file, then extract the structured extraction fields and appraisal criteria. "
    "You MUST respond with ONLY a valid JSON object — no prose, no markdown fences, no explanation."
)


def create_byot_agent(model_id: str = "us.anthropic.claude-sonnet-4-6", db=None) -> Agent:
    """
    Create the BYOT template review agent.

    Reads user-uploaded template markdown files and extracts structured
    extraction fields and appraisal criteria for user review and approval.
    """
    BYOT_MARKDOWN_DIR.mkdir(parents=True, exist_ok=True)
    return Agent(
        id="byot-agent",
        name="BYOT Template Review Agent",
        role="Parse template documents and extract structured extraction fields and appraisal criteria",
        model=AwsBedrock(id=model_id, max_tokens=16000),
        tools=[
            FileTools(
                base_dir=BYOT_MARKDOWN_DIR,
                enable_read_file=True,
                enable_save_file=False,
                enable_delete_file=False,
                enable_read_file_chunk=False,
                enable_replace_file_chunk=False,
                enable_list_files=False,
                enable_search_content=False,
            ),
        ],
        instructions=[BYOT_INSTRUCTIONS],
        markdown=False,
        debug_mode=True,
        db=db,
        update_memory_on_run=False,
    )
