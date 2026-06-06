# Edu Agent


The system implements a strict linear state machine: PDF ingestion triggers a Mastra workflow that parses, plans, then **suspends itself** inside PostgreSQL until a human approves the generated lesson plan. On approval, the workflow resumes from the exact serialized checkpoint, initializes an MCQ quiz loop across all learning objectives, and tracks every attempt in both Redis (hot path) and Postgres (durable audit). Engineering priority was placed entirely on durable workflow state, context-window efficiency, and deterministic JSON data transport not on UI chrome or authentication scaffolding.

---

## 📹 End-to-End System Walkthrough

[![Watch the Walkthrough](https://img.shields.io/badge/▶%20Watch-System%20Walkthrough-blue?style=for-the-badge&logo=youtube)](https://youtu.be/Ea0BltO46Xk)


---

## Core Architectural Highlights



### Durable Workflow Suspension (Human-in-the-Loop)

The `suspendForApprovalStep` (`src/mastra/steps/suspendForApproval.step.ts`) calls Mastra's `suspend()` primitive, which **serializes the entire execution snapshot** including step outputs, context variables, and the resume schema into the `PostgresStore` (configured in `src/mastra/index.ts` via `@mastra/pg`). The compute process is fully spun down; no memory or CPU is consumed while awaiting the user. When the user hits **Approve** or **Reject** on the frontend, `POST /api/workflow/resume` retrieves the stored `workflowRunId` from the `learning_sessions` table, calls `workflow.createRun({ runId })` to rehydrate the frozen run, and fires `run.resume({ resumeData: { approved: boolean } })`. Mastra validates the payload against `ApprovalResumeSchema` (a `zod` object enforcing `{ approved: z.boolean() }`) before advancing the state machine to `initializeQuizStep`. The `WorkflowSnapshot` Prisma model (`prisma/schema.prisma`) additionally records the `stepId` and serialized `snapshot` JSON for operational observability.

### Headless Generative UI Sync via CopilotKit

The CopilotKit runtime (`app/api/copilotkit/route.ts`) is **never used as a chat interface**. Instead, it functions as an abstract data bus transport layer: the `CopilotRuntime` + `GroqChatAdapter` combination processes structured action payloads and streams valid JSON schema packets back to the frontend canvas. The UI components (`QuizWidget.tsx`, `PlanApproval.tsx`, `SessionSummary.tsx`) are driven entirely by well typed state objects (`QuizState`, `LearningPlan`, `SessionResult`) defined in `types/index.ts` never by freeform LLM text. This bypasses all open ended chat box unpredictability

### Context Hygiene & Data Isolation

The PDF is parsed exactly once, at the API boundary (`POST /api/upload`), using `pdf-parse`. The extracted `rawText` is written immediately to the `learning_sessions.rawText` column (`@db.Text`) and never re read from the uploaded file again. All downstream LLM calls structure extraction, plan generation, and per objective MCQ generation consume only a deterministic `truncatedText` slice (`rawText.slice(0, 12000)` for planning, `rawText.slice(0, 10000)` for quiz generation) preventing runaway token consumption and ensuring context window usage is bounded and predictable.

---

## System Architecture Diagram


https://github.com/user-attachments/assets/8c990b69-b072-40c7-8bcc-5a7f2940acb5


---

## Component Data Flow Matrix

| Layer / Component | Core Responsibility | Technology |
|---|---|---|
| **Frontend Canvas** | Renders wizard step UI (upload → approve → quiz → summary); fires typed API calls; consumes JSON state from backend | Next.js 14 App Router, React 18, Tailwind CSS | Stateless re renders driven by API response payloads (`LearningPlan`, `QuizState`, `SessionResult`) |
| **Transport Layer** | Acts as headless data bus for CopilotKit action syncing; streams validated JSON schema packets to canvas components | `@copilotkit/runtime`, `@copilotkit/react-core`, `GroqChatAdapter` | Stateless per request; no session retained in CopilotKit runtime |
| **API Routes** | Orchestrates upload, workflow lifecycle, quiz answer submission; implements polling loops for async workflow status | Next.js Route Handlers (`/api/upload`, `/api/workflow/resume`, `/api/quiz/answer`) | Reads/writes `WorkflowStatus` enum from `learning_sessions` via Prisma; implements up-to-60-attempt polling loops |
| **Orchestration Engine** | Defines and executes the 3 step durable workflow; manages `suspend()` / `resume()` lifecycle; validates all step I/O with Zod schemas | `@mastra/core` workflows, `@mastra/pg` PostgresStore, Zod | Serializes full execution snapshots to `workflow_snapshots` (PostgreSQL) on suspend; rehydrates on `createRun({ runId })` |
| **Plan Service** | Extracts document structure; generates adaptive `LearningPlan` with typed `LearningObjective[]`; validates output against `LearningPlanSchema` | `planService`, `groq.ts` (`llama-3.1-8b-instant`), Zod | Writes `structuredContent` + `learningPlan` JSONB to `learning_sessions`; emits `plan_generated` to `session_events` |
| **Quiz Service** | Generates per objective MCQ banks; processes answer submissions; mutates `QuizState` with attempt telemetry; triggers summary on completion | `quizService`, `groq.ts` (`llama-3.1-8b-instant`), Zod (`MCQQuestionSchema`) | Write-through cache: hot reads/writes via Redis (`session:{id}:quizState`, TTL 2h); durable writes to `learning_sessions.quizState` JSONB |
| **Reporting Service** | Generates `SessionResult` summary with per objective scores, study tips, and overall feedback on quiz completion | `reportingService`, Groq inference | Writes `sessionResult` JSONB + `status: COMPLETE` to `learning_sessions`; emits `quiz_complete` to `session_events` |
| **Persistence — PostgreSQL** | Durable session record, workflow snapshots, structured JSONB payloads, full event audit log | Prisma ORM 5.x, PostgreSQL 16, `@mastra/pg` | `learning_sessions` (primary session SSOT), `workflow_snapshots` (HITL freeze point), `session_events` (append-only audit) |
| **Persistence — Redis** | High speed quiz state cache for answer submission hot path; avoids DB round-trips on every MCQ interaction | `ioredis` 5.x, Redis 7 (`appendonly yes`) | Key pattern: `session:{sessionId}:quizState`; TTL: 7200s; eviction: `allkeys-lru`; 256 MB cap; graceful fallback to PostgreSQL on miss |
| **Inference Engine** | Provides LLM completions for structure extraction, lesson planning, MCQ generation, and session summaries | Groq SDK (`groq-sdk`), `llama-3.1-8b-instant` (primary), JSON mode enforced | Stateless per-call; `json_object` response format enforced for all schema-generating calls; temperature tuned per task (0.1 structure, 0.2 plan, 0.4 quiz) |

---

## Architectural Trade offs & Engineering Decisions


### Scope Limitation — No Authentication or RBAC

Authentication and role based access control were intentionally excluded from this implementation. The engineering focus was directed at three harder problems: proving that Mastra's `suspend()`/`resume()` primitive could correctly serialize and rehydrate a multi step workflow across a cold process restart; achieving deterministic, schema valid JSON output from an LLM inference pipeline under tight token constraints; and designing a Redis/PostgreSQL dual write strategy that maintains quiz state consistency across the hot and cold paths.
### Cloud LPUs (Groq) vs. Local Hosting (Ollama)

Groq was selected for one primary reason: it completely decouples the development environment from local hardware constraints. Running `llama-3.1-8b-instant` or `mixtral-8x7b-32768` locally via Ollama requires 8–16 GB of VRAM minimum, produces inference latencies in the 2–10 second range on consumer hardware, and adds operational complexity (model management, quantization decisions, GPU driver compatibility). Groq's Language Processing Units deliver sub second time-to first token for both models out of the box, via a standard OpenAI compatible REST API, with no local hardware dependency.

---

## 🚀 Quick Start

### Prerequisites

- **Node.js** ≥ 23.x
- **Docker** + **Docker Compose** v3.9+
- **Groq API Key** — obtain from [console.groq.com](https://console.groq.com)

### 1. Clone & Install

```bash
git clone <your-repo-url>
cd ai-learning-agent
npm install
```

### 2. Configure Environment

Create a `.env` file in the project root:

```env
# PostgreSQL — matches docker-compose.yml credentials
DATABASE_URL="postgresql://learnai:learnai_secret@localhost:5432/learnai_db"

# Redis — local Docker instance
REDIS_URL="redis://localhost:6379"

# Groq — required for all LLM inference
GROQ_API_KEY="gsk_your_key_here"

# App base URL
NEXT_PUBLIC_APP_URL="http://localhost:3000"
```

### 3. Start Infrastructure

Spin up PostgreSQL 16 and Redis 7 via Docker Compose:

```bash
docker compose up -d
```

This starts:
- `learnai_postgres` on port `5432` (user: `learnai`, password: `learnai_secret`, db: `learnai_db`)
- `learnai_redis` on port `6379` (256 MB cap, `allkeys-lru` eviction, AOF persistence enabled)

Both services include healthchecks. Confirm they are healthy before proceeding:

```bash
docker compose ps
```

### 4. Initialize the Database

Generate the Prisma client and push the schema:

```bash
npm run setup
```

This runs `prisma generate` followed by `prisma db push`, creating the `learning_sessions`, `workflow_snapshots`, and `session_events` tables, along with the `WorkflowStatus` enum.

### 5. Run the Development Server

```bash
npm run dev
```

The application will be available at [http://localhost:3000](http://localhost:3000).

### Available Scripts

| Script | Description |
|---|---|
| `npm run dev` | Start Next.js development server |
| `npm run build` | Build for production |
| `npm run start` | Start production server |
| `npm run setup` | Generate Prisma client + push schema (run once after `docker compose up`) |
| `npm run db:migrate` | Run Prisma migrations (for schema changes) |
| `npm run db:studio` | Open Prisma Studio GUI at `localhost:5555` |

---

## Database Schema Reference

| Model | Table | Purpose |
|---|---|---|
| `LearningSession` | `learning_sessions` | Primary session record: raw PDF text, structured content, learning plan, quiz state, workflow run ID, and `WorkflowStatus` enum |
| `WorkflowSnapshot` | `workflow_snapshots` | Mastra execution snapshot at the HITL suspension point; stores `stepId`, `snapshot` JSON, and `runId` |
| `SessionEvent` | `session_events` | Append-only audit log for all lifecycle events: `upload`, `plan_generated`, `plan_approved`, `plan_rejected`, `quiz_started`, `answer_submitted` |

### `WorkflowStatus` Enum

```
PENDING → PARSING → PLAN_READY → SUSPENDED_FOR_APPROVAL → APPROVED → QUIZ_ACTIVE → COMPLETE
                                                                                  ↘ FAILED
```
