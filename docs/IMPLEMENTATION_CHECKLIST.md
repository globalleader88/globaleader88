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

## Phase 2 — Integrations & hardening (NOT STARTED)
- ⬜ Alembic migrations (replace `create_all`)
- ⬜ Real authentication: user accounts + per-integration API keys / JWT
- ⬜ Restrict CORS to the funnel domain; rate limiting on the webhook
- ⬜ CRM sync (e.g. GoHighLevel/HubSpot) + email/notification on hot leads
- ⬜ Lead enrichment (firmographics, SAM.gov lookup)
- ⬜ Automated nurture sequences & booking (Calendly) round-trip
- ⬜ Analytics / reporting dashboard, conversion tracking
- ⬜ Background job queue for async processing
- ⬜ Point the frontend `CONFIG.leadEndpoint` at the deployed webhook

## Phase 3+ — Ideas
- ⬜ Multi-tenant support, role-based access
- ⬜ A/B testing of assessment + offers
- ⬜ Data warehouse export
