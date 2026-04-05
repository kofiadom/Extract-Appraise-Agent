"""
Pydantic schemas for the REST Quality Assessment Tool appraisal.

These models capture the structured output of the appraisal agent,
which evaluates research quality using the 20-criterion REST framework
(REST Quality Assessment Tool v1, 9 Apr 2025).
"""

from typing import List, Literal
from pydantic import BaseModel, Field


# ── Criterion definitions ────────────────────────────────────────────────────

APPRAISAL_CRITERIA = [
    {
        "id": 1,
        "question": "Is there a clearly focused research question, statement of aims, or does the research address a clearly focused issue?",
        "applicability": ["ALL"],
    },
    {
        "id": 2,
        "question": "Are study design(s) specified and appropriate to address the aims?",
        "applicability": ["ALL"],
    },
    {
        "id": 3,
        "question": "Are all important and relevant studies included in the synthesis?",
        "applicability": ["SYNTHESIS"],
    },
    {
        "id": 4,
        "question": "Is the exposure accurately measured to minimize bias?",
        "applicability": ["COHORT"],
    },
    {
        "id": 5,
        "question": "Are all important confounders accounted for in the research design/analysis?",
        "applicability": ["COHORT"],
    },
    {
        "id": 6,
        "question": "Is the recruitment strategy appropriate to address the aims of the study?",
        "applicability": ["QUALITATIVE", "COHORT"],
    },
    {
        "id": 7,
        "question": "Was the data collected in a way that addressed the research issue?",
        "applicability": ["QUALITATIVE"],
    },
    {
        "id": 8,
        "question": "Did the authors assess the validity or methodological rigor of included studies?",
        "applicability": ["SYNTHESIS"],
    },
    {
        "id": 9,
        "question": "Has the relationship between the researcher and participants been adequately considered?",
        "applicability": ["QUALITATIVE"],
    },
    {
        "id": 10,
        "question": "If a meta-analysis was performed, was it appropriate?",
        "applicability": ["SYNTHESIS"],
    },
    {
        "id": 11,
        "question": "If there was subgroup analysis performed, was it designed appropriately, and the results interpreted accurately?",
        "applicability": ["SYNTHESIS", "COHORT"],
    },
    {
        "id": 12,
        "question": "Was data analysis sufficiently rigorous?",
        "applicability": ["QUALITATIVE"],
    },
    {
        "id": 13,
        "question": "Was the follow-up of subjects complete enough?",
        "applicability": ["COHORT"],
    },
    {
        "id": 14,
        "question": "Were the outcomes accurately measured to minimize bias?",
        "applicability": ["COHORT"],
    },
    {
        "id": 15,
        "question": "Are the results reported comprehensively and interpreted appropriately?",
        "applicability": ["ALL"],
    },
    {
        "id": 16,
        "question": "Did the authors report on how precise the results were, and the implications?",
        "applicability": ["ALL"],
    },
    {
        "id": 17,
        "question": "Are the results applicable/generalizable to a local context?",
        "applicability": ["ALL"],
    },
    {
        "id": 18,
        "question": "Did the results of this study fit with other available evidence?",
        "applicability": ["ALL"],
    },
    {
        "id": 19,
        "question": "Do the benefits identified outweigh the harms/costs? Is the research valuable?",
        "applicability": ["ALL"],
    },
    {
        "id": 20,
        "question": "Are there implications for practice as a result of this research?",
        "applicability": ["ALL"],
    },
]


# Study types that map to each applicability category
SYNTHESIS_STUDY_TYPES = {
    "Meta-analysis",
    "Systematic review",
    "Evidence summary / rapid review",
    "Review of the literature",
}

COHORT_STUDY_TYPES = {
    "Cohort study",
    "Randomized controlled trial",
    "Case control study",
    "Cross sectional study",
    "Research",
    "Chart review",
    "Quality improvement report",
    "Modelling",
}

# Qualitative studies are detected from paper content; none in REST list are
# explicitly named "Qualitative study", so the agent determines this from context.
QUALITATIVE_STUDY_TYPES: set[str] = set()


def get_applicable_criteria(study_type: str) -> list[dict]:
    """Return the criteria that apply to a given study type."""
    applicable = []
    for criterion in APPRAISAL_CRITERIA:
        tags = criterion["applicability"]
        if "ALL" in tags:
            applicable.append(criterion)
        elif "SYNTHESIS" in tags and study_type in SYNTHESIS_STUDY_TYPES:
            applicable.append(criterion)
        elif "COHORT" in tags and study_type in COHORT_STUDY_TYPES:
            applicable.append(criterion)
        elif "QUALITATIVE" in tags and study_type in QUALITATIVE_STUDY_TYPES:
            applicable.append(criterion)
    return applicable


# ── Pydantic models ──────────────────────────────────────────────────────────

class CriterionResult(BaseModel):
    """Assessment result for a single quality criterion."""

    criterion_id: int = Field(
        ...,
        description="The criterion number (1-20) from the REST Quality Assessment Tool.",
    )
    question: str = Field(
        ...,
        description="The full text of the criterion question.",
    )
    rating: Literal["Yes", "Partial", "No", "N/A"] = Field(
        ...,
        description=(
            '"Yes" = criterion fully met; '
            '"Partial" = partially met or evidence is mixed; '
            '"No" = criterion not met; '
            '"N/A" = does not apply to this study design.'
        ),
    )
    justification: str = Field(
        ...,
        description=(
            "Brief evidence-based justification (1-3 sentences) citing specific content "
            "from the paper. If N/A, explain why the criterion does not apply."
        ),
    )


class PaperAppraisal(BaseModel):
    """Quality appraisal for a single academic paper."""

    article_reference: str = Field(
        ...,
        description="Full citation of the paper being appraised (NLM/Vancouver format).",
    )
    study_type: str = Field(
        ...,
        description="Study design type, as classified during extraction.",
    )
    criteria: List[CriterionResult] = Field(
        ...,
        description="Ratings for all 20 quality criteria (use N/A for non-applicable ones).",
    )
    quality_score: str = Field(
        ...,
        description=(
            'Score as "X/Y" where X = Yes+Partial count, Y = applicable criteria count '
            '(criteria NOT rated N/A). E.g., "14/18".'
        ),
    )
    quality_rating: Literal["High", "Moderate", "Low"] = Field(
        ...,
        description=(
            "Overall quality rating: "
            "High = ≥75% of applicable criteria met (Yes or Partial); "
            "Moderate = 50–74%; "
            "Low = <50%."
        ),
    )
    strengths: str = Field(
        ...,
        description="Key methodological strengths of the study (2-4 sentences).",
    )
    limitations: str = Field(
        ...,
        description="Key methodological limitations or weaknesses (2-4 sentences).",
    )


class AppraisalResult(BaseModel):
    """Container for quality appraisals of one or more papers."""

    appraisals: List[PaperAppraisal] = Field(
        ...,
        description="List of quality appraisals, one per paper.",
    )
