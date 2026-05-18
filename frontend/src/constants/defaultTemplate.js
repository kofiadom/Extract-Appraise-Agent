export const DEFAULT_EXTRACTION_FIELDS = [
  {
    name: 'Article Reference',
    description: 'Full citation in NLM/Vancouver format.',
    instructions: 'Write the full citation in NLM/Vancouver format.',
    required: true,
  },
  {
    name: 'Country',
    description: 'Where the study was conducted.',
    instructions: 'Name the country or countries where the study took place.',
    required: true,
  },
  {
    name: 'Study Design',
    description: 'The study design type.',
    instructions:
      'Must be one of: Meta-analysis, Systematic review, Evidence summary / rapid review, Review of the literature, Cohort study, Randomized controlled trial, Case control study, Cross sectional study, Research, Chart review, Quality improvement report, Modelling.',
    required: true,
  },
  {
    name: 'Population',
    description: 'The study population.',
    instructions:
      '1 short sentence covering age group, condition, and sample size only (e.g. "Children aged 0–17 years (n=83,468) with ambulatory surgery").',
    required: true,
  },
  {
    name: 'Setting',
    description: 'The care setting and location.',
    instructions: '1 short sentence: the care setting and location only.',
    required: true,
  },
  {
    name: 'Peer Reviewed',
    description: 'Whether the paper is peer reviewed.',
    instructions: '"Yes" or "No".',
    required: true,
  },
  {
    name: 'Intervention',
    description: 'Whether a treatment or procedure was applied to participants.',
    instructions:
      '"Yes" or "No" — whether a treatment, procedure, or therapeutic intervention was applied to participants during the study.',
    required: true,
  },
  {
    name: 'Primary Results',
    description: 'The most important outcome measures and results.',
    instructions: 'Summarise the key findings with data.',
    required: true,
  },
  {
    name: 'Additional Findings',
    description: 'Secondary findings of interest to decision-makers.',
    instructions: 'List any supplementary findings not covered in Primary Results.',
    required: true,
  },
];

export const DEFAULT_APPRAISAL_CRITERIA = [
  {
    name: 'Focused Research Question',
    description:
      'Is there a clearly focused research question, statement of aims, or does the research address a clearly focused issue?',
    applicability: ['ALL'],
    rating_scale: ['Yes', 'Partial', 'No', 'N/A'],
    instructions: 'Rate Yes if the research question is explicit and clearly stated.',
  },
  {
    name: 'Appropriate Study Design',
    description: 'Are study design(s) specified and appropriate to address the aims?',
    applicability: ['ALL'],
    rating_scale: ['Yes', 'Partial', 'No', 'N/A'],
    instructions: 'Assess whether the chosen design logically matches the research question.',
  },
  {
    name: 'Comprehensive Synthesis',
    description: 'Are all important and relevant studies included in the synthesis?',
    applicability: ['SYNTHESIS'],
    rating_scale: ['Yes', 'Partial', 'No', 'N/A'],
    instructions: 'Check search strategy, databases used, and inclusion/exclusion criteria.',
  },
  {
    name: 'Exposure Measurement',
    description: 'Is the exposure accurately measured to minimize bias?',
    applicability: ['COHORT'],
    rating_scale: ['Yes', 'Partial', 'No', 'N/A'],
    instructions: 'Evaluate whether exposure was defined and measured consistently.',
  },
  {
    name: 'Confounders Accounted For',
    description: 'Are all important confounders accounted for in the research design/analysis?',
    applicability: ['COHORT'],
    rating_scale: ['Yes', 'Partial', 'No', 'N/A'],
    instructions: 'Check if known confounders are identified and adjusted for.',
  },
  {
    name: 'Appropriate Recruitment',
    description: 'Is the recruitment strategy appropriate to address the aims of the study?',
    applicability: ['QUALITATIVE', 'COHORT'],
    rating_scale: ['Yes', 'Partial', 'No', 'N/A'],
    instructions: 'Assess whether the sampling method is justified and transparent.',
  },
  {
    name: 'Appropriate Data Collection',
    description: 'Was the data collected in a way that addressed the research issue?',
    applicability: ['QUALITATIVE'],
    rating_scale: ['Yes', 'Partial', 'No', 'N/A'],
    instructions: 'Evaluate whether data collection methods suit the research question.',
  },
  {
    name: 'Study Validity Assessment',
    description: 'Did the authors assess the validity or methodological rigor of included studies?',
    applicability: ['SYNTHESIS'],
    rating_scale: ['Yes', 'Partial', 'No', 'N/A'],
    instructions: 'Check if a critical appraisal tool was applied to included studies.',
  },
  {
    name: 'Researcher–Participant Relationship',
    description:
      'Has the relationship between the researcher and participants been adequately considered?',
    applicability: ['QUALITATIVE'],
    rating_scale: ['Yes', 'Partial', 'No', 'N/A'],
    instructions: 'Look for reflexivity and consideration of researcher influence.',
  },
  {
    name: 'Appropriate Meta-analysis',
    description: 'If a meta-analysis was performed, was it appropriate?',
    applicability: ['SYNTHESIS'],
    rating_scale: ['Yes', 'Partial', 'No', 'N/A'],
    instructions: 'Assess statistical pooling justification and heterogeneity handling.',
  },
  {
    name: 'Appropriate Subgroup Analysis',
    description:
      'If there was subgroup analysis performed, was it designed appropriately, and the results interpreted accurately?',
    applicability: ['SYNTHESIS', 'COHORT'],
    rating_scale: ['Yes', 'Partial', 'No', 'N/A'],
    instructions: 'Check if subgroups were pre-specified and interpreted cautiously.',
  },
  {
    name: 'Rigorous Data Analysis',
    description: 'Was data analysis sufficiently rigorous?',
    applicability: ['QUALITATIVE'],
    rating_scale: ['Yes', 'Partial', 'No', 'N/A'],
    instructions: 'Evaluate transparency and depth of qualitative analysis.',
  },
  {
    name: 'Complete Follow-up',
    description: 'Was the follow-up of subjects complete enough?',
    applicability: ['COHORT'],
    rating_scale: ['Yes', 'Partial', 'No', 'N/A'],
    instructions: 'Assess attrition rates and whether losses to follow-up are described.',
  },
  {
    name: 'Outcome Measurement',
    description: 'Were the outcomes accurately measured to minimize bias?',
    applicability: ['COHORT'],
    rating_scale: ['Yes', 'Partial', 'No', 'N/A'],
    instructions: 'Check if outcome definitions are clear and blinding was used where appropriate.',
  },
  {
    name: 'Comprehensive Results Reporting',
    description: 'Are the results reported comprehensively and interpreted appropriately?',
    applicability: ['ALL'],
    rating_scale: ['Yes', 'Partial', 'No', 'N/A'],
    instructions: 'Evaluate completeness of reporting and whether conclusions match the data.',
  },
  {
    name: 'Precision of Results',
    description:
      'Did the authors report on how precise the results were, and the implications?',
    applicability: ['ALL'],
    rating_scale: ['Yes', 'Partial', 'No', 'N/A'],
    instructions: 'Look for confidence intervals, p-values, or effect size precision.',
  },
  {
    name: 'Generalizability',
    description: 'Are the results applicable/generalizable to a local context?',
    applicability: ['ALL'],
    rating_scale: ['Yes', 'Partial', 'No', 'N/A'],
    instructions: 'Assess whether the study population and setting are comparable to the local context.',
  },
  {
    name: 'Fit with Existing Evidence',
    description: 'Did the results of this study fit with other available evidence?',
    applicability: ['ALL'],
    rating_scale: ['Yes', 'Partial', 'No', 'N/A'],
    instructions: 'Consider whether findings are consistent or inconsistent with similar studies.',
  },
  {
    name: 'Benefits vs. Harms/Costs',
    description: 'Do the benefits identified outweigh the harms/costs? Is the research valuable?',
    applicability: ['ALL'],
    rating_scale: ['Yes', 'Partial', 'No', 'N/A'],
    instructions: 'Evaluate the balance of benefit versus harm/cost based on the evidence.',
  },
  {
    name: 'Implications for Practice',
    description: 'Are there implications for practice as a result of this research?',
    applicability: ['ALL'],
    rating_scale: ['Yes', 'Partial', 'No', 'N/A'],
    instructions: 'Assess whether actionable recommendations for practice are provided.',
  },
];
