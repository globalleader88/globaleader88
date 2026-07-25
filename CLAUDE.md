# CLAUDE.md — Global Connects Lead Engine

Permanent project instructions for AI assistants and contributors. Read this
first before making changes.

## What this project is

**The Global Connects Services, LLC** runs a GovCon (government-contracting)
advisory business. This repository has two parts that form one product:

1. **Frontend funnel** (repo root): a static, browser-only "Federal Contracting
   Readiness Assessment" that captures pre-qualified leads. Files: `index.html`,
   `tracker.html`, `css/`, `js/`, `assets/`. It POSTs completed leads as JSON to
   a configurable `leadEndpoint` (`js/assessment.js` → `CONFIG.leadEndpoint`).

2. **Lead Engine backend** (`backend/`): the production service that *is* that
   endpoint. It ingests leads, scores them, detects duplicates, recommends
   offers, and exposes an admin dashboard. **Phase 1 is complete.**

The two connect by pointing `CONFIG.leadEndpoint` at the backend's
`POST /webhook/lead?secret=...` route.

## Tech stack (backend)

- Python 3.11, FastAPI, SQLAlchemy 2.0, Pydantic v2
- PostgreSQL 16 in production; SQLite for the test suite (portable models only)
- Jinja2 server-rendered admin dashboard
- Docker + docker-compose
- pytest

## Architecture rules (do not break these)

- **One intake path.** Every lead — API, webhook, or CSV import — flows through
  `app/services/intake.process_lead()`. It runs dedup → score → recommend →
  persist and writes an audit `LeadEvent`. Never bypass it.
- **Portable models.** Use only column types that work on both PostgreSQL and
  SQLite (`String/Integer/Float/DateTime/JSON/Enum(native_enum=False)`). This
  keeps the test suite dependency-free. No `ARRAY`, no `JSONB`, no PG-only types.
- **Duplicates are preserved, never merged.** A duplicate is saved as its own row
  with `status="duplicate"` and `duplicate_of_id` set. The original is never
  mutated. This keeps a full history.
- **Config comes from env only** (`app/config.py` via pydantic-settings). No
  secrets in code. Every setting has a dev default so tests boot with no setup.
- **Auth**: HTTP Basic for the dashboard + management API (`require_admin`);
  a shared secret for the public webhook (`require_webhook_secret`). Phase 2
  replaces both with real API keys / accounts.

## Layout

```
backend/
  app/
    config.py          # env-driven settings
    database.py        # engine, session, Base, init_db
    models.py          # Lead, LeadEvent
    schemas.py         # Pydantic request/response models
    auth.py            # admin + webhook auth
    main.py            # FastAPI app + router wiring
    routers/           # leads (API), webhook, dashboard
    services/          # scoring, offers, dedup, csv_io, intake
    templates/         # Jinja2 dashboard
  tests/               # pytest (SQLite)
  sample_data/         # demo CSV
  scripts/seed.py      # load sample data
```

## Working agreements

- **Always run `pytest` from `backend/` before committing.** All tests must pass.
- Add a test with every behavior change. Keep the single-intake-path invariant
  covered.
- Keep the domain vocabulary: leads, readiness score/tier, offers, GovCon.
- Do **not** add external integrations (CRM, email, payments, enrichment) into
  Phase 1 code. Those are Phase 2 and belong behind clean service interfaces.
- Update `docs/IMPLEMENTATION_CHECKLIST.md` when you complete or add scope.

## Roadmap

Phase 1 (done): intake API, Postgres, lead profile, CSV import/export, dedup,
scoring, offer recommendations, admin dashboard, website webhook, Docker, env
template, tests, docs.

Phase 2 (in progress):
- **Increment 1 (done):** Alembic migrations (schema source of truth; prod runs
  `alembic upgrade head`), hashed API-key auth with scopes
  (`app/services/apikeys.py`, `require_api_scope`), integration seams behind
  clean interfaces with self-contained defaults (`app/services/integrations.py`,
  dispatched from the single intake path), public-webhook rate limiting
  (`app/ratelimit.py`), configurable CORS, and an analytics summary endpoint.
- **Increment 2 (done):** pluggable background job queue (`app/services/jobs.py`;
  `inline`/`thread`, selected by `JOB_QUEUE`) so post-intake dispatch runs off
  the request path, and the first real integration — a generic outbound-webhook
  CRM (`CRM_PROVIDER=webhook` + `CRM_WEBHOOK_URL`) posting leads to any Zapier/
  Make/GoHighLevel inbound hook, still routed through the seam and queue.
- **Increment 3 (done):** real user accounts (`app/models.py::User`,
  `app/services/users.py`, `app/services/passwords.py` PBKDF2, `app/routers/users.py`).
  HTTP Basic authenticates against the `users` table with role enforcement
  (`require_admin` / `require_viewer`); env `ADMIN_USERNAME`/`ADMIN_PASSWORD` stay
  a bootstrap login and seed the first admin on startup.
- **Increment 4 (done):** live SMTP email provider on the email seam
  (`app/services/email.py`, `EMAIL_PROVIDER=smtp`). Hot-lead alerts email the
  sales team (`HOT_LEAD_ALERT_TO`) via an SMTP-backed notifier; an opt-in
  welcome email to the prospect (`SEND_WELCOME_EMAIL`). Routed through the seam
  + job queue; failures logged, never break intake.
- **Remaining:** live enrichment provider on the enrichment seam, automated
  nurture, a durable broker (Celery/RQ) behind the `JobQueue` interface, and
  richer analytics.

### Phase 2 rules
- New external providers implement the Protocols in `services/integrations.py`
  and register in the provider maps; **never** call a third-party API from the
  intake path directly. Selection is via `*_PROVIDER` env settings.
- Every schema change ships an Alembic migration (`make migration m="..."`).
  Do not add columns without one. Tests still create tables directly (SQLite).
- API keys are hashed (SHA-256) and shown once. Never log or store plaintext.
