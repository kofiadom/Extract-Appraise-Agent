export interface PaperEvidence {
  article_reference: string;
  country: string;
  study_type: string;
  population: string;
  setting: string;
  peer_reviewed: 'Yes' | 'No';
  intervention: 'Yes' | 'No';
  primary_results: string;
  additional_findings?: string;
}

export interface CriterionResult {
  criterion_id: number;
  question: string;
  rating: 'Yes' | 'Partial' | 'No' | 'N/A';
  justification: string;
}

export interface PaperAppraisal {
  article_reference: string;
  study_type: string;
  criteria: CriterionResult[];
  quality_score: string;
  strengths: string;
  limitations: string;
}

export interface PipelineResult {
  papers?: PaperEvidence[];
  appraisals?: PaperAppraisal[];
}
