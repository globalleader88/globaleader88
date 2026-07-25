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

### Increment 3+ — more live providers & scale (NOT STARTED)
- ⬜ Real user accounts (beyond admin basic auth)
- ⬜ Live email/notification (SendGrid/SES) via the email seam; hot-lead alerts
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
