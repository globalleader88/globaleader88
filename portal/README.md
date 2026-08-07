# Global Connects Client Intelligence Portal

A secure, multi-tenant **AI document-intelligence (RAG) platform**. Business
clients upload confidential documents, ask questions grounded in their own
content, and generate structured business outputs — without pasting sensitive
information into consumer AI chat apps.

> This app lives in `portal/` and is **separate** from the Python "Lead Engine"
> in `backend/`. It has its own stack, database, and lifecycle.

## What it does

- **Isolated organization workspaces.** Every client-owned record carries an
  immutable `organizationId`, resolved server-side and never trusted from the
  browser.
- **Secure uploads.** PDF / DOCX / TXT / CSV / XLSX go to private, encrypted
  object storage via short-lived, server-signed URLs. The server owns the
  storage key; the browser can never choose the path.
- **Background processing.** A database-backed job queue extracts text, chunks
  it (with page/section/sheet/row metadata), embeds it, and stores vectors in
  PostgreSQL + pgvector.
- **Grounded Q&A.** Questions retrieve only the asking organization's chunks,
  send only relevant excerpts to Amazon Bedrock, and return answers with
  citations — clearly flagging when evidence is insufficient.
- **Reports.** Seven grounded report templates (summary, requirements, risk,
  compliance matrix, comparison, executive brief, action items).
- **Administration.** Org settings, user/role management, retention policies,
  usage dashboards, append-only audit logs, and a platform super-admin console.

## Tech stack

Next.js 14 (App Router) · TypeScript (strict) · React 18 · Tailwind + shadcn-style
UI · Prisma · PostgreSQL 16 + pgvector · Amazon Bedrock · S3 + KMS · Amazon
Cognito · database-backed job queue · Vitest + Playwright.

## Quickstart (local, no cloud account needed)

Prerequisites: Node 20+ and Docker.

```bash
cd portal
cp .env.example .env                 # defaults are safe for local dev
docker compose up -d db              # Postgres 16 + pgvector on :5432
npm install
npm run prisma:generate
npm run prisma:migrate               # applies migrations (creates pgvector ext)
npm run seed                         # demo orgs + users (prints logins)
npm run dev                          # app on http://localhost:3000
# in a second terminal — the document processing worker:
npm run worker
```

Defaults use `AI_DRIVER=mock` (deterministic offline embeddings + answers) and
`STORAGE_DRIVER=local` (filesystem), so the whole flow — upload → process →
ask → cite — works with **no AWS account**. Point `AI_DRIVER=bedrock` and
`STORAGE_DRIVER=s3` when you're ready for real inference and storage.

### Seed logins

The seed prints these (dev auth only):

| Login | Role |
| --- | --- |
| `admin@globalconnects.local` / `ChangeMe!2026` | Platform super admin (+ Acme admin) |
| `orgadmin@acme.local` / `ChangeMe!2026` | Acme — Organization Admin |
| `analyst@acme.local` / `ChangeMe!2026` | Acme — Analyst |
| `viewer@acme.local` / `ChangeMe!2026` | Acme — Viewer |
| `orgadmin@globex.local` / `ChangeMe!2026` | Globex — Admin (separate tenant) |

Sign in as an Acme user and a Globex user in two browsers to see tenant
isolation first-hand.

### Everything in Docker

```bash
docker compose --profile full up --build
```

Runs Postgres, the app (migrates + seeds on boot), and the worker.

## Scripts

| Script | Purpose |
| --- | --- |
| `npm run dev` | Next.js dev server |
| `npm run build` / `start` | Production build / serve |
| `npm run worker` | Background document-processing worker |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run lint` | ESLint |
| `npm run format` | Prettier |
| `npm test` | Vitest unit + integration |
| `npm run test:e2e` | Playwright (needs a running app + DB) |
| `npm run prisma:migrate` | Apply migrations |
| `npm run seed` | Seed demo data |

## Security posture (the short version)

- `organizationId` is derived from the authenticated user × a live membership ×
  the session hint, and re-validated on every request. A tampered session
  cookie is cryptographically rejected; a stale hint is ignored.
- Every client-data query is org-scoped; vector search filters by org in SQL.
- Storage keys are server-generated and validated against the org prefix before
  any URL is issued.
- Documents are treated as **untrusted data** and wrapped in a delimited region;
  the system prompt refuses instructions found in document content.
- Cross-tenant access returns `404`, never `403`, to avoid existence disclosure.

See `docs/portal/SECURITY.md` and `docs/portal/THREAT_MODEL.md`.

## Documentation

All under `docs/portal/`:

- `ARCHITECTURE.md` — system design and request lifecycles
- `DATA_MODEL.md` — every Prisma model, indexes, tenancy
- `THREAT_MODEL.md` — STRIDE + multi-tenant threats and mitigations
- `SECURITY.md` — controls inventory, IAM examples, compliance-readiness
- `DEPLOYMENT.md` — local + AWS deployment guide
- `COST_CONTROLS.md` — budgets, limits, model routing, caching
- `DATA_RETENTION.md` — retention, deletion, legal hold, backups
- `API.md` — server actions and route handlers
- `IMPLEMENTATION_PLAN.md` — phased build status and remaining risks

## Compliance notice

This platform provides **technical controls**. It is **not** automatically
compliant with CMMC, FedRAMP, NIST SP 800-171, HIPAA, SOC 2, ITAR, or CUI
requirements. Compliance depends on your configuration, infrastructure,
policies, contracts, personnel, and operating procedures.
