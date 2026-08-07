# Portal Architecture

**Global Connects Client Intelligence Portal** — a secure, multi-tenant AI
document-intelligence (RAG) platform.

This document describes the system as it is actually built in `portal/`. It is
technical reference for engineers and reviewers. Where a capability is planned
but not implemented, this document says so explicitly.

---

## 1. Product context: two separate products

This repository contains two distinct products that should not be conflated:

| | **Lead Engine** (`backend/`) | **Client Intelligence Portal** (`portal/`) |
|---|---|---|
| Purpose | GovCon lead intake, scoring, dedup, offers | Multi-tenant document intelligence / RAG |
| Stack | Python 3.11, FastAPI, SQLAlchemy, Pydantic | Next.js 14, TypeScript, Prisma, PostgreSQL + pgvector |
| Tenancy | Single-tenant advisory back office | Multi-tenant, per-organization isolation |
| AI | none | Amazon Bedrock (LLM + Titan embeddings) |
| Auth | HTTP Basic / shared secret / API keys | Cognito (prod), sealed session cookie |

**This document covers only the Portal.** The Lead Engine is a separate service
with its own architecture and lifecycle; the two share a repository but not
code, database, or deployment. They are not integrated today.

---

## 2. System overview

The Portal lets an authenticated user in an organization upload documents
(PDF/DOCX/TXT/CSV/XLSX), have them processed into vector-searchable chunks, and
then ask grounded questions or generate structured reports that cite the source
documents. Every operation is scoped to a single organization; a user never
sees another tenant's data.

Key properties:

- **Server-authoritative tenancy.** The browser never supplies an
  `organizationId`. The active organization is resolved server-side from the
  authenticated user, their live membership, and a session hint.
- **Grounded AI.** The model only ever receives retrieved excerpts from the
  caller's own documents, wrapped as untrusted data, with an injection-hardened
  system prompt. Answers cite their sources and declare when evidence is
  insufficient.
- **Single intake path for documents.** All uploads flow through the upload
  service → a database-backed job → the processing pipeline. There is no
  side-channel that writes chunks directly.
- **Provider abstraction.** Storage and AI are behind driver interfaces so the
  same code runs locally against MinIO + a mock model, or in AWS against S3 +
  Bedrock, with no call-site changes.

---

## 3. Component diagram

```
                          Browser (React 18 / Next.js App Router UI)
                          - React Hook Form + Zod client validation
                          - Uploads bytes DIRECTLY to storage via presigned URL
                                 |                         |
                    server actions / route handlers        | presigned PUT (bytes)
                                 v                         v
   +-------------------------------------------------+   +-----------------------+
   |          Next.js server (Node runtime)          |   |   S3 / MinIO bucket    |
   |                                                 |   |  (private, SSE-KMS)    |
   |  env.ts        runtime env validation           |   +-----------------------+
   |  authz/        tenant-isolation core            |             ^
   |  auth/         session + Cognito/dev adapter     |            | server-side
   |  documents/    validate, upload, extract, chunk |             | get/put/delete
   |  rag/          vectors, prompt, answer          |-------------+
   |  reports/      grounded report generation       |
   |  ai/           provider iface + router + pricing|--------> Amazon Bedrock
   |  jobs/         DB-backed queue + dispatcher      |          (LLM + Titan embed)
   |  usage/        token + query limits             |
   |  storage/      driver + server-owned keys       |
   |  retention.ts  soft-delete + purge sweep        |
   |  audit.ts      append-only audit log            |
   |  ratelimit.ts  in-memory fixed window (MVP)     |
   +-------------------------------------------------+
                                 |
                                 v
   +-------------------------------------------------+     Cognito (prod auth /
   |   PostgreSQL 16 + pgvector (RDS in prod)         |     MFA / signup / forgot)
   |   - relational tenant data (Prisma)             |
   |   - document_chunks.embedding vector(1024)      |
   |   - processing_jobs (the queue)                 |
   +-------------------------------------------------+

   Worker process (npm run worker):  claims jobs -> runs pipeline / retention
```

The **worker** is the same codebase running the job dispatcher in a loop
(`src/lib/jobs/worker-runner.ts`). In local dev it is a separate
docker-compose service; in AWS it can be a long-running task or a scheduler that
ticks `processOneJob()`.

---

## 4. Request lifecycles

### 4.1 Authentication

1. The user submits credentials to a server action / route handler.
2. The configured **auth adapter** verifies them:
   - **Production:** `cognito-adapter` performs `USER_PASSWORD_AUTH` against a
     Cognito user pool, handling MFA and `NEW_PASSWORD_REQUIRED` challenges plus
     signup / confirm / forgot-password flows.
   - **Local dev only:** `dev-adapter` verifies a PBKDF2 hash stored in
     `User.devPasswordHash`. It is disabled in production by an env guard
     (`ENABLE_DEV_AUTH` must be `false`).
3. On success the server creates an **iron-session sealed cookie** containing
   `userId` and an `activeOrganizationId` *hint*. The cookie is `httpOnly`,
   `secure`, `sameSite=lax`, with an 8-hour TTL. It is cryptographically sealed,
   so a tampered cookie is rejected.
4. Every subsequent protected call runs through `authz`, which re-loads the user
   and re-validates the org membership. The cookie is a hint, never an
   authority.

### 4.2 Document upload (presigned URL flow)

```
Browser                     Server (upload service)             Storage        Queue
  |  initiateUpload(meta) ------> validateUpload()                 |             |
  |                              buildDocumentKey (server-owned)   |             |
  |                              create Document + DocumentVersion |             |
  |                              presignUpload(key, mime) -------->  presigned URL|
  | <---- {documentId, versionId, presigned PUT} ----             |             |
  |                                                                |             |
  |  PUT bytes directly to storage ------------------------------> (SSE-KMS)     |
  |                                                                |             |
  |  finalizeUpload(documentId) -> status PENDING; enqueueJob ------------------> QUEUED
```

- The **server owns the S3 key**: `organizations/{orgId}/documents/{docId}/{versionId}/{safeName}`.
  The browser supplies only a display file name, which is sanitized
  (path-traversal safe) before it is embedded. It can neither choose the path
  nor reach another org's prefix.
- `validateUpload` enforces an allow-list of types (PDF/DOCX/TXT/CSV/XLSX), a
  size cap (`MAX_UPLOAD_SIZE_MB`), and a MIME/extension cross-check. Deeper
  magic-byte sniffing is re-verified server-side during processing.
- The presigned PUT carries SSE-KMS headers and a short TTL
  (`PRESIGNED_URL_EXPIRATION_SECONDS`, default 300s).
- `finalizeUpload` flips the document to `PENDING` and enqueues a
  `DOCUMENT_PROCESSING` job. **This is the only way document bytes enter the
  processing pipeline.**

### 4.3 Background processing pipeline

Run by the worker for a single document (`src/lib/documents/pipeline.ts`):

```
fetch bytes from storage
  -> verify sha256 checksum (recorded at upload) matches stored bytes
  -> magic-byte sniff must match declared MIME
  -> extractText (per type; captures page / section / sheet / rowRange)
  -> chunkDocument (normalize whitespace, strip repeated headers/footers,
                    ~700-token chunks with ~100-token overlap, preserve location)
  -> for each chunk: generateEmbedding -> insertChunkWithEmbedding (raw SQL)
  -> update Document: status=READY, chunkCount, pageCount, sha256
  -> metrics + audit event
```

The pipeline is **idempotent**: it deletes prior chunks for the document before
rebuilding, so a retried job converges to the same state. On failure the worker
schedules a backoff retry; once attempts are exhausted the document is marked
`FAILED` with a safe, truncated error string.

### 4.4 RAG question-answering

`answerQuestion(ctx, conversationId, question, documentScope)`
(`src/lib/rag/answer.ts`):

```
audit: AI_QUERY_SUBMITTED
  -> sanitizeQuestion (strip control chars, cap length)
  -> assertWithinLimits (org monthly tokens + per-user daily queries)
  -> load OrganizationSetting (maxChunks, maxContextTokens, threshold, ...)
  -> generateEmbedding(question)  + recordUsage(embedding)
  -> searchChunks: org-scoped pgvector cosine search
       filters: organizationId + doc not deleted + status READY
                + optional document subset + similarity >= threshold
  -> assembleContext: token-budgeted <document_excerpts> block, delimiters
                      neutralized, each excerpt labeled with title + location
  -> generateText(system prompt + excerpts, standard model)
  -> detect insufficient evidence (no usable chunks OR model says so)
  -> persist: USER message + ASSISTANT message + Citations (transaction)
  -> recordUsage(chat) + audit: AI_RESPONSE_GENERATED
```

Only relevant excerpts — never whole documents — reach the model. Citations are
persisted so the UI can link back to the authorized source.

### 4.5 Report generation

`generateReport(ctx, {type, documentScope})` (`src/lib/reports/generate.ts`)
follows the same grounded, org-scoped pattern as chat, but is driven by one of
seven fixed templates (see §7). It:

- creates a `GeneratedReport` in `GENERATING` state,
- retrieves excerpts using the template's retrieval query (with a larger chunk
  budget than chat),
- if no usable evidence is found, completes with an honest
  "not enough information" body,
- otherwise generates Markdown, prepends a header stamping the generation date +
  model id + an **evidence disclaimer**, appends a Sources block, and stores the
  citations JSON,
- records usage and an audit event; on error the report is marked `FAILED` with
  a generic message (no internals leaked).

---

## 5. Single-intake principle for documents

Analogous to the Lead Engine's single intake path, the Portal enforces **one
path for documents into the searchable corpus**:

```
upload service (initiate + finalize)
     -> ProcessingJob (DB queue)
          -> worker dispatch
               -> processDocument pipeline
                    -> insertChunkWithEmbedding (the ONLY writer of embeddings)
```

Nothing writes `document_chunks` embeddings except the pipeline, and the
pipeline is only ever reached through an enqueued job created by
`finalizeUpload`. This guarantees that every chunk was validated, checksum- and
sniff-verified, and org-scoped. There is no bulk import or admin backdoor that
bypasses validation in the current codebase.

---

## 6. Multi-tenancy model

**Invariant:** every client-owned row carries an immutable `organizationId`, and
the *application* is responsible for injecting the authorized organization into
every query. The database schema encodes the foreign keys, indexes, and
org-scoped unique constraints that back this, but Postgres alone does not
enforce tenancy — the `authz` layer does. (There is no row-level-security policy
in the schema today; isolation is a code invariant.)

### How `organizationId` is resolved (never from the browser)

`src/lib/authz/index.ts` is the isolation core:

- `requireAuthenticatedUser()` — loads a non-deleted, non-suspended user from
  the sealed session's `userId`.
- `getAuthorizedOrganization(userId, session)` — resolves the active org
  **server-side**: prefer the session's `activeOrganizationId` hint *only if*
  the user still has an `ACTIVE` membership in that (non-deleted) org; otherwise
  fall back to the user's most recent active membership. Returns `null` if the
  user belongs to no organization.
- `requireOrganizationMembership({minRole, allowSuspended})` — the workhorse:
  authenticated user + resolved org + active membership + role gate. Blocks
  suspended memberships always and suspended organizations by default.
- `requireOrganizationRole(minRole)` — role-gated convenience wrapper. Role
  hierarchy is `VIEWER < ANALYST < ADMIN`.
- `requirePlatformSuperAdmin()` — for platform operators.
- `assertDocumentAccess` / `assertConversationAccess` — load a resource only if
  it belongs to the caller's org and is not soft-deleted. A cross-tenant miss
  returns **404, not 403**, so the platform never confirms the existence of
  another tenant's resource.

Defence in depth at the data layer: `searchChunks` *requires* an
`organizationId` and always filters on it, and `document_chunks` itself carries
`organizationId` — so even a forgotten higher-level check cannot leak vectors
across tenants. Storage keys are likewise validated against the org prefix
(`assertKeyBelongsToOrg`) before any download URL is issued.

### Roles

- **Platform Super Admin** — manage/suspend organizations, view platform-wide
  usage, security events, and system health. By policy this role must **not**
  casually view client document contents.
- **Org Admin / Analyst / Viewer** — least-privilege access within a single
  organization.

---

## 7. AI provider abstraction and model routing

`src/lib/ai/provider.ts` defines a provider-agnostic interface:
`generateText`, `streamText`, `generateEmbedding`, `countTokens`.

- **`BedrockProvider`** (`AI_DRIVER=bedrock`) — Amazon Bedrock using the
  Anthropic Messages schema for chat, Titan for embeddings, with streaming.
- **`MockProvider`** (`AI_DRIVER=mock`, the default) — deterministic hash-based
  embeddings and canned grounded answers, so the whole system runs in tests and
  local dev with no cloud account. Mock is refused in production by the env
  guard.

**Model routing** (`src/lib/ai/router.ts`) maps a task class to a concrete model
id, preferring per-organization overrides on `OrganizationSetting` and falling
back to env:

| Task class | Used for | Env fallback |
|---|---|---|
| `low` | classification, metadata extraction, simple Q&A, summaries | `AWS_BEDROCK_LOW_COST_MODEL_ID` |
| `standard` | detailed analysis, report generation, multi-doc synthesis (also chat) | `AWS_BEDROCK_CHAT_MODEL_ID` |
| `advanced` | complex reasoning, proposal strategy, compliance review | `AWS_BEDROCK_ADVANCED_MODEL_ID` |

Report types map to task classes via `taskClassForReport` (e.g. risk analysis
and compliance matrix → `advanced`; summary and action items → `low`).

**Reports:** every chat and every report records a `UsageRecord` with token
counts and an estimated cost in **micro-USD** (`1e-6` USD) to avoid float drift
(`src/lib/ai/pricing.ts`). Per-org monthly token limits and per-user daily query
limits are hard stops enforced before generation (`src/lib/usage/limits.ts`).

---

## 8. Job queue design

`src/lib/jobs/queue.ts` — a durable, **database-backed** queue on the
`processing_jobs` table. No Redis in the MVP; the interface is deliberately
small so a Celery/RQ/SQS broker can replace it later without touching producers.

- **Enqueue** — `enqueueJob` inserts a `QUEUED` row (`DOCUMENT_PROCESSING` by
  default; `RETENTION_SWEEP` and `DATA_EXPORT` also exist as types).
- **Claim-with-lock** — `claimNextJob` selects the oldest runnable job
  (`QUEUED`/`RETRYING`, `runAfter <= now`) then does a **conditional
  `updateMany`** gated on `status` and `lockedBy IS NULL`. If another worker won
  the race the update affects zero rows and the claim returns `null`. This makes
  claiming atomic without a broker and safe for concurrent workers.
- **Complete** — `completeJob` sets `COMPLETED`, clears the lock, stores metrics.
- **Fail with backoff** — `failJob` retries with exponential backoff
  (`2^attempts` seconds, capped at 60s) until `attempts` reach `maxAttempts`
  (default 3), then marks `FAILED`.
- **Reclaim stale** — `reclaimStaleJobs` returns jobs whose worker died
  mid-run (stale `lockedAt`) to `RETRYING`. The worker loop runs this
  periodically.

The dispatcher (`src/lib/jobs/worker.ts`) claims one job, routes by `type`, and
records the outcome. `runWorkerLoop` polls with a 1-second idle backoff.

---

## 9. Local dev vs AWS production topology

The same code runs in both environments; drivers and env flags differ.

| Concern | Local dev | AWS production |
|---|---|---|
| App + worker | docker-compose `app` and `worker` services | Long-running Next.js server + worker task |
| Database | Postgres 16 + pgvector container | **RDS** PostgreSQL 16 + pgvector |
| Object storage | **MinIO** (`STORAGE_DRIVER=minio`) or `local` filesystem | **S3** private bucket, `STORAGE_DRIVER=s3` |
| Encryption at rest | AES256 / MinIO default | **KMS** SSE-KMS (`AWS_KMS_KEY_ID` required) |
| AI | `AI_DRIVER=mock` (no cloud) | **Bedrock** (`AI_DRIVER=bedrock`) |
| Auth | `dev-adapter` (`ENABLE_DEV_AUTH=true`) | **Cognito** user pool |
| Application logs | stdout JSON | **CloudWatch** |
| AWS-side audit | n/a | **CloudTrail** (infra audit; distinct from the app's `AuditLog`) |
| Secrets | `.env` file | **Secrets Manager** |

**Production guardrails** (`src/env.ts`): when `NODE_ENV=production` the app
refuses to boot if `ENABLE_DEV_AUTH` is on, the session secret is still the dev
default, `AI_DRIVER=mock`, `STORAGE_DRIVER=local`, S3 is selected without a KMS
key, or Cognito is unconfigured. A misconfigured deploy fails fast rather than
running insecurely.

`STORAGE_DRIVER=local` routes uploads/downloads through authenticated app routes
instead of presigned URLs and is intended for dev only.

---

## 10. Extension points for the GovCon expansion (designed-for, not implemented)

The Portal is structured so a GovCon-specific workload can be layered on without
schema churn, but **that workload is not built today.** What exists:

- **`ReportType` enum** — the seven report templates
  (`DOCUMENT_SUMMARY`, `REQUIREMENTS_EXTRACTION`, `RISK_ANALYSIS`,
  `COMPLIANCE_MATRIX`, `COMPARISON`, `EXECUTIVE_BRIEF`, `ACTION_ITEMS`) are
  general-purpose. GovCon deliverables (solicitation analysis, FAR/DFARS
  extraction, compliance matrices, proposal outlines, past-performance,
  capability statements, pricing workbooks, bid/no-bid, subcontractor docs)
  would be added as new `ReportType` values plus templates — no new tables.
- **`ClassificationLevel` enum** (`PUBLIC`/`INTERNAL`/`CONFIDENTIAL`/`RESTRICTED`)
  gives a handling label per document that GovCon sensitivity workflows can build
  on.
- **Generic document model** — the corpus is content-type agnostic (PDF, DOCX,
  spreadsheets), so solicitations and pricing workbooks fit the existing
  `Document`/`DocumentVersion`/`DocumentChunk` model.
- **Provider + router abstraction** — advanced GovCon reasoning tasks can be
  routed to the `advanced` model class per organization.

These are honest extension seams, not shipped features. Implementing GovCon
analysis means new templates, retrieval queries, and prompts — and validating
their accuracy — on top of this foundation.

---

## 11. Assumptions and known MVP limitations

- **Tenancy is a code invariant, not a database guarantee.** There is no
  Postgres row-level security; isolation depends on every data path going
  through `authz` and org-scoped queries.
- **Rate limiting is in-memory.** `src/lib/ratelimit.ts` is a per-process
  fixed-window limiter. In a multi-instance deployment it must be swapped for a
  shared store; today limits are per-instance.
- **Mock AI is the default.** With no configuration the app uses deterministic
  mock embeddings and canned answers. Real intelligence requires
  `AI_DRIVER=bedrock` and Bedrock access.
- **Audit log is append-only by convention.** The application exposes no
  update/delete path for `AuditLog`, and writes are best-effort (they never
  break the primary action). It is not a tamper-proof/WORM store by itself.
- **Embedding dimension is fixed at 1024** and must match
  `AWS_BEDROCK_EMBEDDING_DIMENSION`; changing embedding models means re-embedding
  the corpus.
- **Streaming, DOCX/PDF export, and re-scoring** are anticipated by the code
  shape (e.g. `streamText`, Markdown-only report output) but not all wired
  end-to-end.

### A note on compliance

This codebase provides **technical controls** — tenant isolation, encryption in
transit and at rest, least-privilege roles, audit logging, retention/purge,
prompt-injection defenses. It does **not** by itself confer compliance with
CMMC, FedRAMP, NIST 800-171, HIPAA, SOC 2, ITAR, or CUI handling requirements.
Whether any such standard is met depends on the surrounding infrastructure
configuration, organizational policies, contracts, personnel, and operating
procedures. Treat this repository as a starting point for a compliant system,
not evidence of compliance.
