# Global Connects Lead Engine — Implementation Checklist

Legend: ✅ done · ⬜ not started

## Phase 1 — Lead Engine core (COMPLETE)

### Foundation
- ✅ Inspect current folder / confirm contents (found existing static funnel; not empty)
- ✅ Project structure created under `backend/`
- ✅ `CLAUDE.md` permanent project instructions
- ✅ Git repository (pre-existing; developing on feature branch)
- ✅ Environment-variable template (`backend/.env.example`)
- ✅ Config layer (`app/config.py`, pydantic-settings, env-driven)

### Data layer
- ✅ PostgreSQL database (production) with portable models (SQLite for tests)
- ✅ SQLAlchemy engine/session/base (`app/database.py`)
- ✅ Lead profile model + audit events (`app/models.py`)
- ✅ Pydantic schemas (`app/schemas.py`)

### Engine logic
- ✅ Lead scoring (`app/services/scoring.py`) — transparent 0-100 + hot/warm/cold
- ✅ Offer recommendations (`app/services/offers.py`) — GovCon offer catalog
- ✅ Duplicate detection (`app/services/dedup.py`) — email/phone exact + fuzzy
- ✅ CSV import & export (`app/services/csv_io.py`)
- ✅ Single intake orchestration path (`app/services/intake.py`)

### API & UI
- ✅ Lead intake / management API (`app/routers/leads.py`)
- ✅ Website webhook endpoint (`app/routers/webhook.py`) with alias mapping
- ✅ Basic administrative dashboard (`app/routers/dashboard.py` + templates)
- ✅ Auth: admin HTTP Basic + webhook shared secret (`app/auth.py`)
- ✅ Health endpoint + OpenAPI docs (`/health`, `/docs`)

### Ops & quality
- ✅ Docker setup (`Dockerfile`, `docker-compose.yml`, `.dockerignore`)
- ✅ Seed script + sample data (`scripts/seed.py`, `sample_data/`)
- ✅ Test suite (37 tests, pytest, SQLite) — all passing
- ✅ Setup documentation (`backend/README.md`)
- ✅ Continuous integration (`.github/workflows/ci.yml` runs pytest on push/PR)
- ✅ Developer `Makefile` (install / test / run / seed / docker targets)

## Phase 2 — Integrations & hardening (IN PROGRESS)

### Increment 1 — foundation (COMPLETE)
- ✅ Alembic migrations (replace `create_all`; prod runs `alembic upgrade head`)
- ✅ API-key authentication: hashed keys + scopes + management API
      (`services/apikeys.py`, `routers/apikeys.py`, `require_api_scope`)
- ✅ Restrict CORS to configurable origins; rate limiting on the webhook
      (`ratelimit.py`)
- ✅ Integration seams (CRM/email/enrichment/notifications) behind clean
      interfaces with self-contained defaults, dispatched from the single intake
      path (`services/integrations.py`) — no external calls yet
- ✅ Analytics summary endpoint (`/api/analytics/summary`)
- ✅ Tests for all of the above (20 new; 57 total, all passing)

### Increment 2 — background jobs & first real provider (COMPLETE)
- ✅ Pluggable background job queue (`services/jobs.py`): `inline` (default) +
      `thread`, selected by `JOB_QUEUE`; post-intake dispatch enqueued off the
      request path (each job opens its own session)
- ✅ First real integration: outbound-webhook CRM (`CRM_PROVIDER=webhook`,
      `CRM_WEBHOOK_URL`) via the CRM seam + queue; failures never break intake
- ✅ Tests for job queue (inline/thread) and the webhook provider (11 new;
      68 total, all passing)

### Funnel ↔ Engine integration (VERIFIED)
- ✅ Webhook accepts the funnel's exact payload (`js/leadgen.js`); pinned by a
      contract regression test (`tests/test_webhook.py::test_accepts_exact_funnel_payload`)
- ✅ Funnel's free-text `goal` maps to lead `notes`; score/tier → readiness columns
- ✅ `CONFIG.leadEndpoint` documented with the exact Lead Engine webhook URL form
- ✅ `docker-compose.yml` statically validated; initial migration is Postgres-portable
- ⏳ Live Docker/Postgres run not executed here (no Docker daemon in this sandbox);
      compose + migration verified statically instead
- ⬜ Set `CONFIG.leadEndpoint` to the deployed webhook URL (deploy-time step)

### Increment 3 — real user accounts (COMPLETE)
- ✅ `User` model + PBKDF2 password hashing (`services/passwords.py`, stdlib-only)
- ✅ Alembic migration for the `users` table
- ✅ HTTP Basic authenticates against the users table with role enforcement
      (`require_admin` / `require_viewer`); env admin kept as bootstrap login +
      seeded on startup
- ✅ Users management API (`/api/users`, admin-only CRUD, soft-delete)
- ✅ Tests (16 new; 85 total, all passing)

### Increment 4 — live SMTP email provider (COMPLETE)
- ✅ SMTP transport (`services/email.py`, stdlib `smtplib`, no new dependency)
- ✅ Hot-lead alert emails to the sales team (`SmtpAlertNotifier`, `HOT_LEAD_ALERT_TO`)
- ✅ Opt-in prospect welcome email (`SmtpEmailSender`, `SEND_WELCOME_EMAIL`)
- ✅ Selected by `EMAIL_PROVIDER=smtp`; routed through seam + queue; failures
      logged as `integration_error`, never break intake
- ✅ Tests with a fake SMTP transport (8 new; 93 total, all passing)

### Increment 5+ — remaining providers & scale (NOT STARTED)
- ⬜ Live enrichment (firmographics, SAM.gov) via the enrichment seam
- ⬜ Lead enrichment (firmographics, SAM.gov) via the enrichment seam
- ⬜ Native CRM providers (GoHighLevel/HubSpot) beyond the generic webhook
- ⬜ Automated nurture sequences & booking (Calendly) round-trip
- ⬜ Durable broker (Celery/RQ) behind the `JobQueue` interface
- ⬜ Analytics/reporting dashboard UI, conversion tracking
- ⬜ Point the frontend `CONFIG.leadEndpoint` at the deployed webhook

## Phase 3+ — Ideas
- ⬜ Multi-tenant support, role-based access
- ⬜ A/B testing of assessment + offers
- ⬜ Data warehouse export
