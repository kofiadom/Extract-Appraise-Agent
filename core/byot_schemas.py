"""
Pydantic schemas for the Bring Your Own Template (BYOT) feature.

Users upload template documents (PDF, Word, Excel, CSV) describing custom
extraction fields and appraisal criteria. The BYOT agent parses these into
structured data that is presented to the user for approval, then injected
into the extraction and appraisal agents at pipeline runtime.
"""

from datetime import datetime
from typing import List
from pydantic import BaseModel, Field


class ExtractionField(BaseModel):
    """One custom field to be extracted from each research paper."""

    name: str = Field(..., description="Field name, e.g. 'Study Population'")
    description: str = Field(..., description="What this field captures")
    instructions: str = Field(..., description="How to extract this field from the paper")
    required: bool = Field(default=True)


class AppraisalCriterion(BaseModel):
    """One custom criterion for assessing paper quality."""

    name: str = Field(..., description="Criterion name, e.g. 'Clear Research Question'")
    description: str = Field(..., description="What is being assessed")
    applicability: List[str] = Field(
        default_factory=lambda: ["ALL"],
        description=(
            "Study types this criterion applies to. "
            "Valid values: 'ALL', 'COHORT', 'SYNTHESIS', 'QUALITATIVE'. "
            "Use ['ALL'] when the criterion applies to every study type."
        ),
    )
    rating_scale: List[str] = Field(
        default_factory=lambda: ["Yes", "Partial", "No", "N/A"],
        description="Valid rating values for this criterion",
    )
    instructions: str = Field(..., description="How to rate this criterion")


class ExtractionTemplate(BaseModel):
    """Custom extraction template: a list of fields to extract from papers."""

    fields: List[ExtractionField] = Field(..., description="Custom extraction fields")


class AppraisalTemplate(BaseModel):
    """Custom appraisal template: a list of criteria for quality assessment."""

    criteria: List[AppraisalCriterion] = Field(..., description="Custom appraisal criteria")


class ByotReviewResult(BaseModel):
    """
    Full output of the BYOT agent — presented to the user for approval
    before being injected into the extraction and appraisal agents.
    """

    extraction: ExtractionTemplate
    appraisal: AppraisalTemplate
    source_files: dict = Field(
        default_factory=dict,
        description="Source filenames: {'extraction': '...', 'appraisal': '...'}",
    )
    parsed_at: datetime = Field(default_factory=datetime.utcnow)
