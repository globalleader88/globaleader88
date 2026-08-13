# Implementation Plan & Status

Phased plan for the Global Connects Client Intelligence Portal, with what is
**done** in this MVP and what remains. The build followed the required
sequence: Planning → Foundation → Multi-tenant security → Documents → AI chat →
Administration → Hardening.

## Phase 1 — Planning ✅
- Repository inspected; portal scoped into `portal/` alongside the existing
  Lead Engine.
- Planning docs authored: `ARCHITECTURE.md`, `DATA_MODEL.md`, `THREAT_MODEL.md`,
  plus `SECURITY.md`, `DEPLOYMENT.md`, `COST_CONTROLS.md`, `DATA_RETENTION.md`,
  `API.md`.
- Assumptions and mock/adapter strategy defined so no external credential blocks
  local progress.

## Phase 2 — Foundation ✅
- Next.js 14 + strict TypeScript, Tailwind + shadcn-style UI primitives.
- Prisma schema (18 models) + initial migration incl. pgvector extension and an
  HNSW cosine index.
- Zod-validated runtime env (`src/env.ts`) with production guardrails.
- Structured, redacting logger; typed error model; Prisma singleton.
- Docker Compose (Postgres+pgvector, MinIO) and Dockerfile.
- Auth adapters: Cognito (prod) and a clearly-marked dev adapter (disabled in
  prod by env guard).

## Phase 3 — Multi-tenant security ✅
- `src/lib/authz`: `requireAuthenticatedUser`, `getAuthorizedOrganization`
  (server-side org resolution), `requireOrganizationMembership` /
  `requireOrganizationRole`, `requirePlatformSuperAdmin`, `assertDocumentAccess`,
  `assertConversationAccess`.
- Sealed session cookie (httpOnly/secure/SameSite, 8h TTL).
- Append-only audit logging with a curated action vocabulary.
- Tenant-isolation unit tests (role hierarchy, forged org hint ignored,
  cross-org document → 404, vector search always org-filtered).

## Phase 4 — Documents ✅
- Secure upload workflow: validate → server-owned key → presigned PUT →
  metadata → SHA-256 → job → audit → status.
- Storage drivers (S3/MinIO + local dev) with SSE-KMS and short-lived URLs.
- Processing pipeline (idempotent): fetch → checksum + magic-byte sniff →
  extract (PDF/DOCX/TXT/CSV/XLSX with location metadata) → normalize + strip
  repeated headers/footers → chunk (~700 tokens, ~100 overlap) → embed → store
  vectors → READY → metrics + audit → safe failure handling.
- Database-backed job queue with claim-with-lock, backoff retries, stale
  reclaim; standalone worker.

## Phase 5 — AI chat ✅
- Provider-agnostic AI interface; Bedrock (Anthropic Messages + Titan
  embeddings + streaming) and a deterministic mock; task-class model router.
- RAG pipeline: sanitize → limits → embed → org-scoped pgvector search →
  threshold → token-budgeted context assembly → generate → persist message +
  citations + usage + audit; insufficient-evidence detection.
- Prompt-injection defenses (untrusted-data framing, delimiter neutralization,
  system-prompt rules); prompt version in cache key.
- Cost controls: per-org monthly token limit, per-user daily query limit, chunk/
  context/output caps, warn threshold, micro-USD usage records.
- Chat UI with citations, new conversation, copy, insufficient-evidence warning.

## Phase 6 — Administration ✅
- Organization settings + retention policy editors.
- User management (invite, role change with last-admin guard, suspend).
- Usage dashboard (org + per-user); audit viewer (admin).
- Platform super-admin console: organizations (suspend/reactivate), platform
  usage, security events, processing failures, system health.
- Reports: 7 grounded templates with citations + evidence disclaimer.

## Phase 7 — Hardening ✅ (MVP scope)
- Security headers + per-request CSP nonce (middleware).
- Input validation (Zod) everywhere; safe error messages; logging redaction.
- Rate limiting on auth; usage limits on AI.
- Unit + integration test scaffolding; Playwright e2e scaffold.
- `typecheck`, `lint`, `build`, and `test` all green.

## Known limitations / remaining risks
- **Rate limiter** now has a pluggable store: in-memory (default, per instance)
  and a shared **Postgres** store (`RATE_LIMIT_STORE=postgres`, backed by the
  `rate_limit_counters` table) for multi-instance deploys. A Redis/Upstash store
  can implement the same `RateLimitStore` interface without touching call sites.
- **Streaming** is wired end-to-end: `streamAnswer` (RAG) → NDJSON route at
  `POST /api/chat/stream` → the chat UI renders tokens as they arrive, then
  finalizes citations. The answer is persisted identically to the blocking path.
  The non-streaming `askAction` remains as a fallback/API.
- **Response caching** is implemented and org-isolated: the cache key hashes
  organization + authorized document set + model + prompt version + normalized
  question, and every lookup also filters by `organizationId`, so answers are
  never shared across tenants. Entries are invalidated when the org's documents
  (processing completed, deletion) or retrieval/model settings change, with a
  TTL backstop (`RESPONSE_CACHE_TTL_SECONDS`). Toggle via `RESPONSE_CACHE_ENABLED`.
  Backed by the `response_cache` table. Summary caching can reuse the same seam.
- **DOCX/PDF report export** and a Markdown renderer are follow-ons (reports are
  Markdown today).
- **Organization data export** and full account/org self-deletion flows are
  modeled (`JobType.DATA_EXPORT`, cascades) but not fully wired into the UI.
- **Re-scoring after enrichment**, nurture automation, and a durable broker are
  future work.
- Integration/e2e tests that exercise pgvector require a live Postgres and are
  gated behind `TEST_DATABASE_URL`.

## Test coverage map (unit, DB-free)
- Chunking, header/footer stripping, token budgeting.
- Upload validation (type, size, MIME/extension mismatch, magic bytes).
- Storage key generation + path-traversal + cross-org key rejection.
- Prompt injection (delimiter neutralization, insufficient evidence, sanitize).
- Model routing + cost estimation.
- Password/token crypto + rate limiting.
- Authorization (role hierarchy, forged-hint rejection, cross-org 404).
- Vector search tenancy (org filter + threshold + dimension guard).
- Response-cache key isolation (org, document scope, model, prompt version,
  question normalization).
