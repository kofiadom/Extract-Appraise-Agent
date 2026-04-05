"""
Pydantic schemas for the REST Table evidence extraction.

These models mirror the Rapid Evidence Synthesis Team (REST)
Table 1 / Table 2 format used for rapid reviews.
"""

from typing import List, Optional
from pydantic import BaseModel, Field


# Valid study types from the REST drop-down list
VALID_STUDY_TYPES = [
    "Case control study",
    "Case history / case study",
    "Chart review",
    "Cohort study",
    "Conference proceeding, abstract, presentation",
    "Cross sectional study",
    "Evidence summary / rapid review",
    "General or background information / text / report",
    "Government document / report",
    "Guidelines",
    "Meta-analysis",
    "Modelling",
    "News media",
    "Opinion, editorial, practice exemplar, story",
    "Policies, procedures, protocols",
    "Preprint",
    "Press release / briefing",
    "Quality improvement report",
    "Randomized controlled trial",
    "Research",
    "Resource Lists",
    "Review of the literature",
    "Systematic review",
    "Unpublished research, review, poster presentation or other ephemera",
    "White paper",
]


class PaperEvidence(BaseModel):
    """Structured evidence extracted from a single academic paper."""

    article_reference: str = Field(
        ...,
        description=(
            "Full citation of the paper in NLM/Vancouver format. "
            "Include authors, title, journal, year, volume, pages, and DOI if available."
        ),
    )
    country: str = Field(
        ...,
        description="Country or countries where the study was conducted.",
    )
    study_type: str = Field(
        ...,
        description=(
            "Type of study. Must be one of: "
            + ", ".join(f'"{st}"' for st in VALID_STUDY_TYPES)
        ),
    )
    population: str = Field(
        ...,
        description=(
            "The study population in one short sentence covering age group, condition, "
            "and sample size only."
        ),
    )
    setting: str = Field(
        ...,
        description="The care setting and location in one short sentence.",
    )
    peer_reviewed: str = Field(
        ...,
        description='Whether the paper is peer-reviewed. Must be "Yes" or "No".',
    )
    intervention: str = Field(
        ...,
        description=(
            'Whether a treatment, procedure, or therapeutic intervention was applied to '
            'participants during the study. Must be "Yes" or "No".'
        ),
    )
    primary_results: str = Field(
        ...,
        description=(
            "The outcome measure and results most pertinent to the research question. "
            "Include key statistics, effect sizes, and confidence intervals where available."
        ),
    )
    additional_findings: Optional[str] = Field(
        None,
        description=(
            "Additional findings that may provide context to the main findings "
            "or be of interest to decision-makers."
        ),
    )


class ExtractionResult(BaseModel):
    """Container for evidence extracted from one or more papers."""

    papers: List[PaperEvidence] = Field(
        ...,
        description="List of extracted evidence entries, one per paper.",
    )
