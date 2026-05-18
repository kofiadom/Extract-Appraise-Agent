# Bring Your Own Template (BYOT) — Implementation Plan

**Status**: Planning  
**Feature**: Allow users to upload custom extraction and appraisal template documents that replace the hardcoded criteria used by the AI pipeline.

---

## 1. Feature Overview

Currently, the extraction and appraisal agents use hardcoded criteria:
- **Extraction**: 9 fixed fields (Article Reference, Country, Study Type, Population, etc.)
- **Appraisal**: 20 fixed REST Quality Assessment Tool criteria

BYOT allows users to upload their own template documents describing custom extraction fields and appraisal criteria. A new **Template Review Agent** parses these documents, presents the guidelines for user approval, and the approved guidelines are injected into the extraction and appraisal agents at pipeline runtime.

If no custom template is provided, the pipeline falls back to the existing hardcoded criteria.

---

## 2. Supported Template Formats

- PDF (`.pdf`)
- Word (`.docx`)
- Excel (`.xlsx`)
- CSV (`.csv`)

Templates are natural-language or structured documents that describe what fields to extract and what criteria to use for appraisal. The Template Review Agent interprets them.

---

## 3. Architecture Overview

```
User uploads extraction template + appraisal template
            ↓
FastAPI: convert to markdown (LlamaParse for PDF/Word; pandas for Excel/CSV)
            ↓
Template Review Agent reads markdown, returns ByotReviewResult JSON
            ↓
Frontend: TemplateReviewModal shows parsed fields + criteria
            ↓
User approves (or cancels to use defaults)
            ↓
Approved guidelines saved to database (per user, reusable)
            ↓
User uploads research PDFs → starts pipeline with template_id
            ↓
Extraction Agent builds prompt from custom fields
Appraisal Agent builds prompt from custom criteria
            ↓
Results rendered dynamically based on template field names
```

---

## 4. New Files to Create

### `core/byot_schemas.py`

Pydantic models for template data structures:

```
ExtractionField
  - name: str               # e.g. "Study Population"
  - description: str        # what this field captures
  - instructions: str       # how to extract it (from the template doc)
  - required: bool

AppraisalCriterion
  - name: str               # e.g. "Clear Research Question"
  - description: str        # what is being assessed
  - applicability: list[str] # e.g. ["ALL", "COHORT", "SYNTHESIS"]
  - rating_scale: list[str] # e.g. ["Yes", "Partial", "No", "N/A"]
  - instructions: str       # how to rate it

ExtractionTemplate
  - fields: list[ExtractionField]

AppraisalTemplate
  - criteria: list[AppraisalCriterion]

ByotReviewResult
  - extraction: ExtractionTemplate
  - appraisal: AppraisalTemplate
  - source_files: dict      # { "extraction": filename, "appraisal": filename }
  - parsed_at: datetime
```

### `agents/byot_agent.py`

A single Agno agent responsible for parsing both template documents:

- Uses `FileTools` to read the converted markdown files
- System prompt instructs it to:
  - Identify extraction fields (name, description, extraction rule)
  - Identify appraisal criteria (name, description, applicability, rating scale)
  - Return a `ByotReviewResult`-compatible JSON
- Falls back gracefully if a template document is missing or ambiguous (flags unclear fields for the user)
- Model: same Bedrock model as extraction agent (configurable via env)

All four supported formats (PDF, Word, Excel, CSV) are handled directly by the existing `utils/llamaparse_helper.py` — no additional converter is needed. LlamaParse supports all of them natively. The converted markdown is saved to `tmp/byot_templates_md/`, consistent with how research papers are stored in `tmp/papers_fs_md/`.

---

## 5. Files to Modify

### `app.py` — New BYOT Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `POST /byot/upload-templates` | | Accept 2 files (extraction + appraisal template), convert, run BYOT agent async, return `{ job_id }` |
| `GET /byot/job/{job_id}` | | Poll BYOT agent job status; returns `ByotReviewResult` when done |

The pipeline endpoint `POST /pipeline/run-async` gains an optional `template_id` parameter. When present, the background runner loads the saved template from the database and passes it to both agents.

### `agents/extraction_agent.py`

Add a `build_extraction_instructions(template: ExtractionTemplate) -> str` function:

- **Fixed preamble**: role definition, general extraction rules, output format instructions — these never change
- **Dynamic middle section**: loops over `template.fields` to generate numbered field instructions
- **Dynamic JSON schema**: derives the output JSON key names automatically from field names (snake_case)
- When `template=None`, returns the existing hardcoded `EXTRACTION_INSTRUCTIONS_FS` unchanged

The `run_extraction(md_filename, custom_template=None)` function signature gains the optional parameter. If `custom_template` is provided, it calls `build_extraction_instructions(custom_template)` instead of using the hardcoded string.

### `agents/appraisal_agent.py`

Same pattern as extraction:

- Add `build_appraisal_instructions(template: AppraisalTemplate) -> str`
- Fixed preamble (role, rating rules, citation requirement)
- Dynamic criteria block (loop over `template.criteria` with applicability tags)
- `run_appraisal(md_filename, custom_template=None)` gains the optional parameter

### `backend/src/` — NestJS Changes

**New entity**: `UserTemplate`
```
id: uuid
user_id: FK → users
name: string               # user-assigned label e.g. "Q4 Review Criteria"
extraction_template: jsonb # serialized ExtractionTemplate
appraisal_template: jsonb  # serialized AppraisalTemplate
source_files: jsonb        # original filenames
created_at: timestamp
updated_at: timestamp
is_active: boolean         # soft delete
```

**New module**: `backend/src/modules/templates/`
- `templates.controller.ts` — REST endpoints (list, get, delete, set-active)
- `templates.service.ts` — CRUD + business logic
- `templates.module.ts` — module registration

**New controller routes** (under `/api/v1/templates`):

| Route | Method | Description |
|-------|--------|-------------|
| `GET /templates` | | List user's saved templates |
| `GET /templates/:id` | | Get a single template with full details |
| `DELETE /templates/:id` | | Soft-delete a template |
| `PATCH /templates/:id/activate` | | Set as the active template for the pipeline |

**Modify `pipeline.controller.ts`**: Accept optional `templateId` in the run-pipeline request body. The processing service fetches the template from the database and forwards it to FastAPI with the pipeline job.

---

## 6. Frontend Changes

### New Component: `TemplateUploadSection.jsx`

- Two independent upload zones: "Extraction Template" and "Appraisal Template"
- Each accepts PDF, Word, Excel, CSV
- Shows filename badge once a file is selected
- A "Parse Templates" button that triggers `POST /byot/upload-templates`
- Polling state with spinner while the BYOT agent processes

### New Component: `TemplateReviewModal.jsx`

- Full-screen modal (or large drawer) opened after BYOT agent completes
- Two collapsible accordion sections:
  - **Extraction Fields** — renders each field as a card: name (bold), description, extraction rule
  - **Appraisal Criteria** — renders each criterion: name, description, applicability tags (pill badges), rating scale
- Footer: "Approve & Save", "Cancel" buttons
- On approve: calls `PATCH /templates/:id/activate`, stores `templateId` in component state
- On cancel: discards parsed guidelines, pipeline will use defaults

### New Component: `SavedTemplatesDrawer.jsx`

- Accessed via a "Templates" button in the sidebar or upload page
- Lists the user's saved templates with name, date, file sources
- Allows selecting a previously approved template to use for the current run
- Delete button per template

### Modify `UploadPage.jsx`

- Add a **"Custom Template"** toggle (off by default — default mode uses hardcoded criteria)
- When toggled on, renders `TemplateUploadSection` above the research document upload zone
- After template approval, shows a green "Template active: [name]" badge
- Allows switching to a saved template via `SavedTemplatesDrawer`
- `startPipelineJob()` includes `templateId` in the request body when a template is active

### Modify `ResultsPage.jsx`

- **EvidenceTab**: currently maps fixed field names. Change to render dynamically from the result JSON keys — if a template was used, the result will contain custom field names; if defaults were used, the existing 9 fields appear as before.
- **AppraisalTab**: same — render criteria cards dynamically from the result keys instead of a hardcoded list.

### Modify `api.js`

Add:
```javascript
uploadTemplates(extractionFile, appraisalFile)  // POST /byot/upload-templates
pollByotJob(jobId)                               // GET /byot/job/{jobId}
getTemplates()                                   // GET /templates
activateTemplate(templateId)                     // PATCH /templates/:id/activate
deleteTemplate(templateId)                       // DELETE /templates/:id
```

---

## 7. Prompt Construction — How It Works

The extraction and appraisal agent prompts are split into three parts:

| Part | Source | Changes with BYOT? |
|------|--------|--------------------|
| Preamble | Fixed string (role, tone, general rules) | Never changes |
| Field/Criteria block | **Variable substitution from template data** | Yes — this is what changes |
| Output format | Fixed JSON structure rules | Never changes (schema derived from field names) |

**Approach: `string.Template` variable substitution**

We use Python's `string.Template` (which uses `$variable` syntax) rather than `.format()`. This is important because the existing prompts contain JSON examples with `{` and `}` braces — `.format()` would treat those as placeholders and crash. `string.Template` has no such conflict.

```python
from string import Template

EXTRACTION_INSTRUCTIONS_TEMPLATE = Template("""
You are a research evidence extraction assistant...

Extract the following fields from the research document:
$fields_block

For each paper found, return a JSON object with these keys:
$json_schema_comment

Return your answer as: {"papers": [...]}
""")

def build_extraction_instructions(template: ExtractionTemplate) -> str:
    fields_block = "\n".join([
        f"{i+1}. {f.name} — {f.description}\n   Rule: {f.instructions}"
        for i, f in enumerate(template.fields)
    ])

    # JSON key names auto-derived from field names (snake_case)
    json_schema_comment = ", ".join([
        f'"{f.name.lower().replace(" ", "_")}"'
        for f in template.fields
    ])

    return EXTRACTION_INSTRUCTIONS_TEMPLATE.substitute(
        fields_block=fields_block,
        json_schema_comment=json_schema_comment,
    )
```

The same pattern applies to `build_appraisal_instructions(template)` — the 20-criterion block becomes a `$criteria_block` substitution variable.

When `template=None` (no custom template), the function returns the existing `EXTRACTION_INSTRUCTIONS_FS` string unchanged — so default behavior is fully preserved.

**Why `string.Template` over `.format()`**:

| | `str.format()` / f-strings | `string.Template` |
|---|---|---|
| Syntax | `{variable}` | `$variable` |
| Conflict with JSON `{}` in prompt | Yes — must escape as `{{` / `}}` | No conflict |
| Prompt readability | Cluttered with `{{` escapes | Clean, readable |
| Standard library | Yes | Yes |

---

## 8. File Storage

| Content | Location |
|---------|----------|
| Uploaded template PDFs/docs | `tmp/byot_templates/` |
| Converted template markdown | `tmp/byot_templates_md/` |
| Research PDFs (unchanged) | `tmp/papers_fs/` |
| Research markdown (unchanged) | `tmp/papers_fs_md/` |

Template files persist on disk. Database stores the parsed JSON. The two are linked by `template_id`.

---

## 9. Environment Variables (New)

```env
BYOT_MODEL_ID=us.anthropic.claude-sonnet-4-6   # Model for Template Review Agent
MAX_TEMPLATE_FILE_SIZE_MB=20                    # Per-file upload limit for templates
```

---

## 10. Implementation Sequence

The following order minimizes integration risk — each phase can be tested independently.

| Phase | Scope | Deliverable |
|-------|-------|-------------|
| 1 | Schemas only | `core/byot_schemas.py` |
| 2 | BYOT agent + FastAPI endpoints | `agents/byot_agent.py`, `/byot/*` in `app.py` |
| 3 | Prompt builder functions | `build_extraction_instructions`, `build_appraisal_instructions` |
| 4 | Pipeline accepts template_id | Modified `app.py` `_run_pipeline_bg` |
| 5 | NestJS template persistence | `UserTemplate` entity + `templates` module |
| 6 | Frontend template upload + review | `TemplateUploadSection`, `TemplateReviewModal` |
| 7 | Frontend dynamic results rendering | Modified `EvidenceTab`, `AppraisalTab` |
| 8 | Frontend saved templates | `SavedTemplatesDrawer` + `UploadPage` integration |

---

## 11. Open Questions (Resolved)

| Question | Decision |
|----------|----------|
| Template formats | PDF, Word, Excel, CSV |
| Template persistence | Saved to database, reusable across sessions |
| Results rendering | Dynamic — renders whatever fields the template defines |
| Template scope | Per user only |
| Default fallback | Hardcoded criteria used when no template is active |
