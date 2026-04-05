# REST Evidence Extractor

Monorepo for the REST Evidence Extractor — an AI pipeline that extracts structured evidence and quality appraisals from academic papers.

- **Backend** — FastAPI + AgentOS + AWS Bedrock + LlamaParse
- **Frontend** — React + Vite + Tailwind CSS

---

## How it works

1. Upload PDFs → backend converts them to markdown via **LlamaParse**
2. Two AI agents run sequentially via an **AgentOS team** on AWS Bedrock:
   - **Extraction Agent** — reads each markdown file, extracts 9 evidence fields
   - **Appraisal Agent** — rates the paper against 20 REST quality criteria
3. Results are displayed in the React UI and can be exported as Excel, Word, or JSON

---

## Repo structure

```
├── agents/                   # AI agents (FileSearch + LlamaParse)
│   ├── extraction_agent.py
│   └── appraisal_agent.py
├── core/                     # Pydantic schemas
│   ├── schemas.py
│   └── appraisal_schemas.py
├── utils/                    # Export helpers + LlamaParse client
│   ├── llamaparse_helper.py
│   ├── export_excel.py
│   └── export_appraisal_docx.py
├── tools/                    # Bedrock testing scripts
│   ├── list_bedrock_models.py
│   └── test_bedrock.py
├── frontend/                 # React web app
│   ├── src/
│   ├── Dockerfile
│   └── nginx.conf
├── app.py                    # FastAPI + AgentOS backend
├── demo.py                   # Streamlit demo (alternative UI)
├── Dockerfile                # Backend container
├── docker-compose.yml        # Full stack — one command to run everything
└── .env                      # Secrets (not committed)
```

---

## Prerequisites

- AWS account with Bedrock access (cross-region inference enabled)
- LlamaCloud API key — [cloud.llamaindex.ai](https://cloud.llamaindex.ai)
- Docker + Docker Compose **or** Python 3.11+ / Node 20+ for local dev

---

## Quick start — Docker (recommended)

### 1. Configure secrets

```bash
cp .env.example .env   # then fill in your keys
```

Minimum `.env`:

```env
AWS_ACCESS_KEY_ID=your_access_key
AWS_SECRET_ACCESS_KEY=your_secret_key
AWS_REGION=us-east-1
LLAMAPARSE_API_KEY=your_llamacloud_key

# Optional
BEDROCK_MODEL_ID=zai.glm-5
CORS_ORIGINS=https://your-domain.com
```

### 2. Build and start everything

```bash
docker-compose up --build
```

| Service | URL |
|---|---|
| **React UI** | http://localhost |
| **API docs** | http://localhost:7777/docs |
| **Backend** | http://localhost:7777 |

### 3. Stop

```bash
docker-compose down
```

---

## Local development (without Docker)

### Backend

```bash
python -m venv venv && source venv/bin/activate  # or .\venv\Scripts\activate on Windows
pip install -r requirements.txt
python app.py   # http://localhost:7777
```

### Frontend

```bash
cd frontend
npm install
npm run dev     # http://localhost:5173
```

The Vite dev server talks directly to the backend on `http://localhost:7777`.

---

## Testing Bedrock

Before running the full pipeline, verify AWS credentials and model access:

```bash
python tools/list_bedrock_models.py   # list all available models
python tools/test_bedrock.py          # fire a test prompt
```

---

## Supported models (AWS Bedrock)

| Model | ID | Input $/1M | Output $/1M |
|---|---|---|---|
| GLM 5 | `zai.glm-5` | $1.00 | $3.20 |
| Kimi K2.5 | `moonshotai.kimi-k2.5` | $0.14 | $0.59 |
| Claude Sonnet 4.6 | `anthropic.claude-sonnet-4-6` | $3.00 | $15.00 |
| MiniMax M2.5 | `minimax.minimax-m2.5` | $0.40 | $1.20 |

Set `BEDROCK_MODEL_ID` in `.env` to switch models.

---

## API endpoints

| Method | Path | Description |
|---|---|---|
| `POST` | `/upload-fs` | Upload PDFs → convert to markdown via LlamaParse |
| `POST` | `/teams/fs-evidence-team/runs` | Run full extraction + appraisal pipeline |
| `POST` | `/agents/fs-extraction-agent/runs` | Extraction agent only |
| `POST` | `/agents/fs-appraisal-agent/runs` | Appraisal agent only |
| `GET` | `/pipeline/download/excel` | Download evidence table (.xlsx) |
| `GET` | `/pipeline/download/docx` | Download quality appraisal (.docx) |
| `GET` | `/pipeline/download/json` | Download full results (.json) |
| `DELETE` | `/pipeline/reset` | Clear stored results |

Interactive docs: **http://localhost:7777/docs**

---

## Tech stack

| Layer | Technology |
|---|---|
| LLM inference | AWS Bedrock |
| PDF parsing | LlamaParse (LlamaCloud) |
| Agent framework | Agno + AgentOS |
| Backend API | FastAPI + uvicorn |
| Frontend | React 18 + Vite + Tailwind CSS |
| Container serving | nginx |
| Orchestration | Docker Compose |
| Schemas | Pydantic v2 |
| Exports | openpyxl (Excel), python-docx (Word) |
