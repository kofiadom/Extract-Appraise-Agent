# Agno Agentic RAG — NestJS Backend Implementation Plan

## Overview

This is a **multi-user SaaS application**. The backend has two complementary layers:

| Layer | Technology | Responsibility |
|---|---|---|
| **Orchestration** | NestJS + BullMQ + Redis | When work happens, upload caps, job status, retry, result storage |
| **AI execution** | FastAPI + Agno + PostgresDb | Who is running, concurrent async agent calls, session isolation, chat memory |

They solve different problems and work together — NestJS controls the queue, Agno controls the agents.

---

## Architecture

```
React Frontend
      │  HTTP/REST + JWT
      ▼
NestJS Backend  (:3001)
  ├── AuthModule          register / login / JWT
  ├── PapersModule        PDF upload → LlamaParse conversion
  ├── PipelineModule      job submission + status + result storage
  ├── ExportsModule       Excel / Word / JSON download
  ├── ChatModule          session-based document Q&A
  ├── JobsModule ✓        BullMQ job CRUD (built)
  ├── ProcessingModule ✓  BullMQ workers (built)
  └── HealthModule ✓      health checks (built)
         │
         │  BullMQ jobs → Redis
         │  (durable, retryable, observable)
         ▼
  NestJS Workers
  ├── PaperExtractionWorker   HTTP → FastAPI
  ├── PaperAppraisalWorker    HTTP → FastAPI
  └── DocumentIndexingWorker  HTTP → FastAPI
         │
         │  axios POST (one job = one HTTP call)
         │  passes { user_id, session_id, ... }
         ▼
FastAPI + Agno  (:8000)
  ├── await agent.arun(user_id=..., session_id=..., db=PostgresDb)
  ├── asyncio handles all concurrent worker calls simultaneously
  └── PostgresDb stores session history + memory per user
         │
         ▼
AWS Bedrock / LlamaParse / PageIndex
```

---

## Why the two layers complement each other

```
NestJS (BullMQ)                    FastAPI (Agno)
────────────────                   ──────────────
"when and how many"                "who and what context"

✓ enforce upload cap (e.g. 5 docs) ✓ user_id isolates agent memory
✓ retry on Bedrock failure         ✓ session_id isolates chat history
✓ survive server restart           ✓ asyncio.gather runs all workers
✓ frontend polls job status          concurrently inside FastAPI
✓ per-user job history in DB       ✓ PostgresDb persists session state
✓ queue depth / concurrency cap    ✓ no cross-user data contamination
```

The NestJS worker calls FastAPI with a payload that includes `user_id` and `session_id`. Inside FastAPI, `asyncio` runs all concurrent worker calls in parallel — each session is fully isolated. No user blocks another at the FastAPI level.

---

## The Key Link: session_id = BullMQ jobId

```
BullMQ jobId  ──────────────────────────────┐
                                             │
NestJS tracks the job:                       │  same UUID
  pipeline_jobs.id = jobId                  │
  pipeline_jobs.status = active             │
                                             │
FastAPI tracks the session:                 ↓
  agent.arun(session_id=jobId, ...)   ← session_id = jobId
  PostgresDb stores session under jobId
```

One UUID ties the NestJS job record to the Agno session record. NestJS knows if the job succeeded; Agno knows what happened inside it.

---

## Multi-user concurrent flow

```
User A uploads 3 papers (cap: 5 max — enforced by NestJS PipelineController)
User B uploads 2 papers at the same time

NestJS creates 5 PipelineJob records (3 for A, 2 for B)
NestJS adds 5 jobs to BullMQ queue

QUEUE_CONCURRENCY = 5 → all 5 picked up simultaneously

Worker 1 → POST /agents/fs-extraction-agent/runs
           { user_id: "user-A", session_id: "job-uuid-1", message: "path/paper1.md" }

Worker 2 → POST /agents/fs-extraction-agent/runs
           { user_id: "user-A", session_id: "job-uuid-2", message: "path/paper2.md" }

Worker 3 → POST /agents/fs-extraction-agent/runs
           { user_id: "user-A", session_id: "job-uuid-3", message: "path/paper3.md" }

Worker 4 → POST /agents/fs-extraction-agent/runs
           { user_id: "user-B", session_id: "job-uuid-4", message: "path/paper1.md" }

Worker 5 → POST /agents/fs-extraction-agent/runs
           { user_id: "user-B", session_id: "job-uuid-5", message: "path/paper2.md" }

FastAPI receives all 5 calls concurrently
→ asyncio runs all 5 agent.arun() coroutines in parallel
→ each session_id is isolated in Agno PostgresDb
→ User A and User B results never mix
→ Bedrock calls go out concurrently (5 total, within cap)

Workers write results back to NestJS PostgreSQL (pipeline_jobs.result)
Frontend polls GET /jobs/:id/status for each paper independently
```

---

## Agno Session Management — where it applies

| Module | Agno sessions? | Reason |
|---|---|---|
| **Extraction pipeline** | `user_id` + `session_id` only | Not conversational — no chat history needed. Session ID = job ID. Provides agent-level isolation + concurrent async execution |
| **Appraisal pipeline** | `user_id` + `session_id` only | Same as above |
| **Chat with document** | Full sessions with memory | Conversational, multi-turn, per-user memory — exactly what Agno sessions are designed for |

For extraction and appraisal, the main benefit of `await agent.arun()` is **concurrent async execution** inside FastAPI (multiple workers handled simultaneously without blocking). The session history storage is not the goal — each paper run is one-shot.

For the chat module, full Agno session management applies: `update_memory_on_run=True`, persistent conversation history, per-user memory retrieval.

---

## FastAPI Changes Required

### 1. Remove global `_state` dict

```python
# REMOVE THIS — broken for multi-user
_state = {}

# REMOVE THIS — jobs lost on restart, no status tracking
asyncio.create_task(run_pipeline())
```

### 2. Make pipeline endpoints stateless (called by NestJS workers)

```python
# BEFORE: stateful, blocking, multi-user broken
@app.post("/pipeline/run-async")
async def run_async():
    _state["result"] = await run_pipeline()  # global state

# AFTER: stateless, one call = one result, NestJS stores it
@app.post("/agents/fs-extraction-agent/runs")
async def run_extraction(request: AgentRunRequest):
    result = await extraction_agent.arun(
        request.message,
        user_id=request.user_id,      # from NestJS worker payload
        session_id=request.session_id, # = BullMQ jobId
        db=postgres_db,
    )
    return result  # NestJS worker stores this in pipeline_jobs.result
```

The existing AgentOS endpoints (`/agents/*/runs`) may already be stateless — verify and keep them. Only the `_state` dict and `asyncio.create_task()` pattern needs removing.

### 3. Configure Agno PostgresDb

```python
from agno.db.postgres import PostgresDb

# Agno's own session storage (separate from NestJS job tracking DB)
agno_db = PostgresDb(db_url=os.getenv("AGNO_DB_URL"))

extraction_agent = Agent(
    model=...,
    db=agno_db,
    update_memory_on_run=False,  # extraction is one-shot, no memory accumulation
)

appraisal_agent = Agent(
    model=...,
    db=agno_db,
    update_memory_on_run=False,
)

chat_agent = Agent(
    model=...,
    db=agno_db,
    update_memory_on_run=True,   # chat is conversational, memory matters
)
```

### 4. FastAPI request model from NestJS workers

```python
class AgentRunRequest(BaseModel):
    message: str          # markdown file path or question
    user_id: str          # from JWT token (passed by NestJS worker)
    session_id: str       # = BullMQ jobId (links Agno session to NestJS job)
    stream: bool = False
```

---

## NestJS Worker → FastAPI Contract

Workers are thin HTTP callers. All AI logic stays in FastAPI.

```typescript
// PaperExtractionWorker
@Process(JOB_TYPES.PAPER_EXTRACTION)
async handleExtraction(job: Job<JobPayload>) {
  const { jobId, userId, data } = job.data;

  await this.jobRepo.update(jobId, { status: 'active', progress: 10 });

  const response = await axios.post(`${FASTAPI_URL}/agents/fs-extraction-agent/runs`, {
    message: data.markdownPath,
    user_id: userId,
    session_id: jobId,   // BullMQ jobId = Agno session_id
    stream: false,
  });

  await this.jobRepo.update(jobId, {
    status: 'completed',
    progress: 100,
    result: response.data,
  });

  return response.data;
}
```

---

## Two Separate Databases

NestJS and Agno each use their own PostgreSQL database (or schemas):

| Database | Used by | Stores |
|---|---|---|
| `agno_rag` (NestJS) | NestJS + TypeORM | `users`, `pipeline_jobs` |
| `agno_sessions` (FastAPI) | FastAPI + Agno PostgresDb | Agno session history, agent memory, run metadata |

They can be on the same PostgreSQL server with different database names, or the same database with different schemas. The `session_id = jobId` is the logical link — no foreign key needed between them.

---

## Database Design (NestJS / TypeORM)

### `users` table

| Column | Type | Notes |
|---|---|---|
| `id` | UUID PK | generated |
| `email` | VARCHAR UNIQUE | login identity |
| `passwordHash` | VARCHAR | bcryptjs, excluded from selects |
| `createdAt` | TIMESTAMP | |
| `updatedAt` | TIMESTAMP | |

### `pipeline_jobs` table

| Column | Type | Notes |
|---|---|---|
| `id` | UUID PK | = BullMQ jobId = Agno session_id |
| `userId` | UUID FK → users | ownership |
| `status` | VARCHAR | `queued\|active\|completed\|failed\|cancelled` |
| `progress` | INTEGER | 0–100 |
| `jobType` | VARCHAR | `paper-extraction\|paper-appraisal\|document-indexing` |
| `inputData` | JSONB | markdown paths, paper metadata |
| `result` | JSONB | extraction/appraisal JSON from FastAPI |
| `error` | VARCHAR | failure message |
| `createdAt` | TIMESTAMP | |
| `updatedAt` | TIMESTAMP | set by worker on each status change |

---

## Upload Cap Enforcement (NestJS)

Enforced in `PipelineController` before any jobs are queued:

```typescript
@Post('run')
@UseGuards(JwtAuthGuard)
async runPipeline(@Body() body: RunPipelineDto, @CurrentUser() user: AuthUser) {
  const MAX_DOCS_PER_RUN = 5;  // Bedrock concurrency limit

  if (body.paperIds.length > MAX_DOCS_PER_RUN) {
    throw new BadRequestException(
      `Maximum ${MAX_DOCS_PER_RUN} documents per run due to processing limits`
    );
  }

  // also check user's currently active jobs
  const activeCount = await this.jobRepo.count({
    where: { userId: user.userId, status: In(['queued', 'active']) },
  });

  if (activeCount > 0) {
    throw new ConflictException('You already have a pipeline run in progress');
  }

  return this.pipelineService.runPipeline(user.userId, body.paperIds);
}
```

---

## Queue & Concurrency Settings

```env
QUEUE_CONCURRENCY=5    # global worker slots across all users
                       # tune based on Bedrock token/request limits
MAX_RETRY_ATTEMPTS=3   # auto-retry on Bedrock throttle errors
JOB_TIMEOUT=600000     # 10 min max per job
```

BullMQ retry with exponential backoff is already configured in `redis.config.ts`. If Bedrock returns a throttle error, the job automatically retries up to 3 times with increasing delays.

---

## API Endpoints (full target)

### Auth — no JWT required

| Method | Path | Description |
|---|---|---|
| POST | `/api/v1/auth/register` | Create account → returns JWT |
| POST | `/api/v1/auth/login` | Login → returns JWT |
| GET | `/api/v1/auth/me` | Current user info |

### Jobs — all require JWT

| Method | Path | Description |
|---|---|---|
| POST | `/api/v1/jobs` | Submit generic job → `{ jobId }` |
| GET | `/api/v1/jobs` | List caller's jobs (paginated, filter by status) |
| GET | `/api/v1/jobs/:id/status` | Poll status + progress |
| GET | `/api/v1/jobs/:id/result` | Get completed result |
| DELETE | `/api/v1/jobs/:id` | Cancel queued/active job |
| GET | `/api/v1/jobs/_/metrics` | Caller's job counts + avg processing time |

### Papers — JWT required

| Method | Path | Description |
|---|---|---|
| POST | `/api/v1/papers/upload` | Upload PDFs → LlamaParse markdown (max 5) |

### Pipeline — JWT required

| Method | Path | Description |
|---|---|---|
| POST | `/api/v1/pipeline/run` | Start extraction + appraisal (cap enforced) |
| GET | `/api/v1/pipeline/jobs/:id` | Poll pipeline job status |
| DELETE | `/api/v1/pipeline/reset` | Clear caller's stored results |

### Exports — JWT required

| Method | Path | Description |
|---|---|---|
| GET | `/api/v1/exports/excel` | Download evidence table (.xlsx) |
| GET | `/api/v1/exports/docx` | Download appraisal document (.docx) |
| GET | `/api/v1/exports/json` | Download full results (.json) |

### Chat — JWT required

| Method | Path | Description |
|---|---|---|
| POST | `/api/v1/chat/index` | Upload + index PDF → `{ jobId }` |
| GET | `/api/v1/chat/index/jobs/:id` | Poll indexing status |
| GET | `/api/v1/chat/documents` | List caller's indexed documents |
| DELETE | `/api/v1/chat/documents/:id` | Remove indexed document |
| POST | `/api/v1/chat/query` | Query document (proxies to FastAPI with session) |

### Health — no auth

| Method | Path | Description |
|---|---|---|
| GET | `/api/v1/health` | Redis + queue health |

---

## Queue Names & Job Types

```typescript
// src/types/index.ts

export const QUEUE_NAMES = {
  BACKGROUND_JOBS: 'background-jobs',
} as const;

export const JOB_TYPES = {
  BACKGROUND_JOB:     'background-job',      // ✓ Phase 1 stub
  PAPER_EXTRACTION:   'paper-extraction',    // Phase 3
  PAPER_APPRAISAL:    'paper-appraisal',     // Phase 3
  DOCUMENT_INDEXING:  'document-indexing',   // Phase 5
} as const;
```

---

## Directory Structure (target)

```
src/
├── app.module.ts
├── main.ts
├── config/
│   └── redis.config.ts              ✓ done
├── database/
│   └── database.module.ts           Phase 2
├── entities/
│   ├── user.entity.ts               Phase 2
│   └── pipeline-job.entity.ts       Phase 2
├── modules/
│   ├── auth/                        Phase 2
│   │   ├── auth.module.ts
│   │   ├── auth.controller.ts
│   │   ├── auth.service.ts
│   │   ├── auth.interfaces.ts       AuthUser { userId, email }
│   │   ├── jwt.strategy.ts
│   │   ├── jwt-auth.guard.ts
│   │   ├── current-user.decorator.ts
│   │   └── dto/
│   │       ├── register.dto.ts
│   │       ├── login.dto.ts
│   │       └── index.ts
│   ├── users/                       Phase 2
│   │   ├── users.module.ts
│   │   └── users.service.ts
│   ├── jobs/                        ✓ Phase 1 — update Phase 2
│   │   ├── jobs.module.ts
│   │   ├── jobs.controller.ts       + JwtAuthGuard + @CurrentUser()
│   │   ├── jobs.service.ts          + userId ownership + PostgreSQL
│   │   └── dto/
│   │       ├── submit-job.dto.ts    remove userId (comes from JWT)
│   │       ├── job-status.dto.ts
│   │       ├── api-response.dto.ts
│   │       └── index.ts
│   ├── processing/                  ✓ Phase 1 — update Phase 2
│   │   ├── processing.module.ts     + TypeOrmModule.forFeature([PipelineJob])
│   │   ├── processors/
│   │   │   └── background-job.processor.ts  + DB status updates
│   │   └── services/
│   │       └── processing.service.ts
│   ├── papers/                      Phase 3
│   │   ├── papers.module.ts
│   │   ├── papers.controller.ts     POST /papers/upload (max 5 files)
│   │   ├── papers.service.ts
│   │   └── llamaparse.client.ts     HTTP wrapper around LlamaCloud API
│   ├── pipeline/                    Phase 3
│   │   ├── pipeline.module.ts
│   │   ├── pipeline.controller.ts   POST /pipeline/run (cap enforced)
│   │   ├── pipeline.service.ts
│   │   ├── extraction/
│   │   │   └── extraction.worker.ts  @Process('paper-extraction')
│   │   └── appraisal/
│   │       └── appraisal.worker.ts   @Process('paper-appraisal')
│   ├── exports/                     Phase 4
│   │   ├── exports.module.ts
│   │   ├── exports.controller.ts
│   │   └── exports.service.ts       exceljs + docx
│   ├── chat/                        Phase 5
│   │   ├── chat.module.ts
│   │   ├── chat.controller.ts
│   │   └── chat.service.ts          proxies to FastAPI with session context
│   └── health/                      ✓ done
└── types/
    └── index.ts                     ✓ done
```

---

## New Dependencies (by phase)

```bash
# Phase 2 — auth + database
npm install @nestjs/typeorm typeorm pg @nestjs/passport passport passport-jwt @nestjs/jwt bcryptjs
npm install -D @types/passport-jwt @types/bcryptjs

# Phase 3 — file uploads
npm install multer
npm install -D @types/multer

# Phase 4 — exports
npm install exceljs docx
```

---

## Environment Variables (full reference)

```env
# App
NODE_ENV=development
PORT=3000

# Redis (BullMQ)
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=
REDIS_DB=0

# NestJS PostgreSQL (users + pipeline_jobs)
DB_HOST=localhost
DB_PORT=5432
DB_USERNAME=postgres
DB_PASSWORD=postgres
DB_NAME=agno_rag

# JWT
JWT_SECRET=replace-with-a-long-random-secret-in-production
JWT_EXPIRES_IN=7d

# FastAPI service URL (called by NestJS workers)
FASTAPI_URL=http://localhost:8000

# File paths (shared volume between NestJS and FastAPI)
PAPERS_FS_PATH=./tmp/papers_fs
PAPERS_MD_PATH=./tmp/papers_fs_md
PAGEINDEX_PAPERS_PATH=./tmp/pageindex_papers

# Job Queue
QUEUE_CONCURRENCY=5
MAX_RETRY_ATTEMPTS=3
JOB_TIMEOUT=600000

# Upload cap
MAX_DOCS_PER_RUN=5

# Throttling
ENABLE_THROTTLING=true
THROTTLE_TTL=60
THROTTLE_LIMIT=100

# Docs
ENABLE_SWAGGER=true
```

```env
# FastAPI .env additions
AGNO_DB_URL=postgresql+psycopg://postgres:postgres@localhost:5432/agno_sessions
```

---

## Docker Compose (target)

```yaml
services:
  postgres:
    image: postgres:16-alpine
    environment:
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD: postgres
      POSTGRES_MULTIPLE_DATABASES: agno_rag,agno_sessions
    volumes:
      - postgres_data:/var/lib/postgresql/data
    ports:
      - "5432:5432"

  redis:
    image: redis:7-alpine
    ports:
      - "6379:6379"

  fastapi:
    build: .
    ports:
      - "8000:8000"
    volumes:
      - ./tmp:/app/tmp
    environment:
      AGNO_DB_URL: postgresql+psycopg://postgres:postgres@postgres:5432/agno_sessions
    env_file: .env
    depends_on:
      - postgres

  nestjs:
    build: ./base-service/base-service
    ports:
      - "3001:3000"
    volumes:
      - ./tmp:/app/tmp
    environment:
      NODE_ENV: production
      REDIS_HOST: redis
      DB_HOST: postgres
      FASTAPI_URL: http://fastapi:8000
    env_file: ./base-service/base-service/.env
    depends_on:
      - postgres
      - redis
      - fastapi

  frontend:
    build: ./frontend
    ports:
      - "80:80"
    environment:
      VITE_API_URL: http://nestjs:3000

volumes:
  postgres_data:
```

---

## Implementation Phases

### Phase 1 — Foundation (Complete ✓)
- [x] NestJS scaffold with BullMQ + Redis
- [x] Generic `JobsModule` (submit, status, list, cancel, metrics)
- [x] `BackgroundJobProcessor` stub
- [x] Health monitoring + Swagger

### Phase 2 — Auth + Database
- [ ] `npm install @nestjs/typeorm typeorm pg @nestjs/passport passport passport-jwt @nestjs/jwt bcryptjs`
- [ ] `DatabaseModule` — TypeORM + PostgreSQL (`agno_rag` database)
- [ ] `User` entity — id, email, passwordHash, timestamps
- [ ] `PipelineJob` entity — id (= jobId = session_id), userId, status, progress, jobType, inputData, result, error, timestamps
- [ ] `UsersModule` — findById, findByEmail, create
- [ ] `AuthModule` — register, login, JWT strategy, `JwtAuthGuard`, `@CurrentUser()` decorator
- [ ] Update `JobsModule` — `TypeOrmModule.forFeature([PipelineJob])`, userId ownership
- [ ] Update `JobsService` — PostgreSQL as source of truth (not BullMQ status queries)
- [ ] Update `JobsController` — all routes behind `JwtAuthGuard`, userId from token
- [ ] Update `BackgroundJobProcessor` — write status to `pipeline_jobs` via TypeORM
- [ ] Update `ProcessingModule` — `TypeOrmModule.forFeature([PipelineJob])`
- [ ] Update `main.ts` — `addBearerAuth()` in Swagger
- [ ] Update `SubmitJobDto` — remove `userId` field (comes from JWT now)

### Phase 3 — Papers + Pipeline
- [ ] `npm install multer && npm install -D @types/multer`
- [ ] `PapersModule` — PDF upload (max 5), LlamaParse async HTTP polling, save `.md` to shared volume
- [ ] `PipelineModule` — cap enforcement (max docs + no active jobs check), submit extraction + appraisal jobs per paper
- [ ] `PaperExtractionWorker` — HTTP POST to FastAPI with `{ message, user_id, session_id }`
- [ ] `PaperAppraisalWorker` — same pattern, passes extraction result as context
- [ ] Update `types/index.ts` — add `PAPER_EXTRACTION`, `PAPER_APPRAISAL` job types
- [ ] **FastAPI changes:**
  - Remove `_state` dict
  - Remove `asyncio.create_task()` pipeline jobs
  - Add `AgentRunRequest` Pydantic model (`message`, `user_id`, `session_id`)
  - Update agents to `await agent.arun(user_id=..., session_id=..., db=agno_db)`
  - Configure `agno_db = PostgresDb(db_url=AGNO_DB_URL)`
  - Set `update_memory_on_run=False` for extraction/appraisal agents (one-shot)
- [ ] Frontend — point `VITE_API_URL` to NestJS `:3001`

### Phase 4 — Exports
- [ ] `npm install exceljs docx`
- [ ] `ExportsModule` — read `pipeline_jobs.result` from DB, stream file to browser
- [ ] `ExcelGenerator` — REST Table 2 format (9 evidence columns per paper row)
- [ ] `DocxGenerator` — quality appraisal document (20 criteria sections per paper)

### Phase 5 — Chat
- [ ] `ChatModule` — per-user document indexing + conversational Q&A
- [ ] `DocumentIndexingWorker` — HTTP POST to FastAPI indexing endpoint
- [ ] `IndexedDocument` entity — userId, fileName, docId, indexedAt
- [ ] `ChatController` — proxy query to FastAPI with `{ question, user_id, session_id }`
- [ ] **FastAPI chat agent** — `update_memory_on_run=True`, full Agno session management
- [ ] Chat session_id = user-chosen conversation thread (not jobId)

### Phase 6 — Production Hardening
- [ ] Per-user rate limiting via throttler
- [ ] Structured logging (`nestjs-pino`)
- [ ] TypeORM migrations (replace `synchronize: true`)
- [ ] `JWT_SECRET` validation on startup (fail fast if default value)
- [ ] CORS locked to specific frontend origin
- [ ] Docker Compose with `POSTGRES_MULTIPLE_DATABASES` init script
- [ ] Bedrock retry budget monitoring (alert if retry rate > threshold)
