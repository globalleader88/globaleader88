# Global Connects Lead Engine — Backend (Phase 1)

Production lead-intake service for The Global Connects Services, LLC. It ingests
leads (API, website webhook, or CSV), **scores** them, **detects duplicates**,
**recommends offers**, and serves a **basic admin dashboard**.

It is the backend for the static "Federal Contracting Readiness Assessment"
funnel in the repository root: point that funnel's `CONFIG.leadEndpoint`
(`js/assessment.js`) at this service's `/webhook/lead` route.

---

## Deploy to production

One-click deploy to Render via the repo's Blueprint (`render.yaml`) — provisions
Postgres + the API, runs migrations, generates secrets. See
[`docs/DEPLOY_RENDER.md`](../docs/DEPLOY_RENDER.md).

## Quick start (Docker — recommended)

Requires Docker + Docker Compose.

```bash
cd backend
cp .env.example .env          # then edit ADMIN_PASSWORD + WEBHOOK_SECRET
docker compose up --build     # starts PostgreSQL + the API
```

- **Dashboard:** http://localhost:8000/  (log in with `ADMIN_USERNAME` /
  `ADMIN_PASSWORD` from your `.env`)
- **API docs (OpenAPI):** http://localhost:8000/docs
- **Health check:** http://localhost:8000/health

Load demo leads (optional), from another terminal:

```bash
docker compose exec api python -m scripts.seed
```

---

## Quick start (local Python, no Docker)

Requires Python 3.11+ and a reachable PostgreSQL — **or** just use SQLite for a
zero-dependency spin-up.

```bash
cd backend
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt

# Option A: SQLite (fastest — no database to install)
export DATABASE_URL="sqlite:///./leadengine.db"

# Option B: PostgreSQL
#   export DATABASE_URL="postgresql+psycopg2://leadengine:leadengine@localhost:5432/leadengine"

export ADMIN_PASSWORD=changeme
export WEBHOOK_SECRET=dev-webhook-secret

python -m scripts.seed          # optional: load sample leads
uvicorn app.main:app --reload   # http://localhost:8000
```

---

## Running the tests

The suite runs on SQLite and needs no external services:

```bash
cd backend
pip install -r requirements.txt
pytest
```

All 37 tests should pass.

---

## Connecting the assessment funnel

In the repo-root funnel, open `js/assessment.js` and set:

```js
leadEndpoint: "https://your-host:8000/webhook/lead?secret=YOUR_WEBHOOK_SECRET"
```

Leads submitted through the assessment then flow straight into the engine,
arriving already scored with recommended offers attached.

---

## API overview

Public (webhook-secret auth):

| Method | Path             | Purpose                                  |
|--------|------------------|------------------------------------------|
| POST   | `/webhook/lead`  | Website/CRM posts a lead (JSON)          |

Admin (HTTP Basic auth):

| Method | Path                      | Purpose                          |
|--------|---------------------------|----------------------------------|
| GET    | `/`                       | Admin dashboard (HTML)           |
| GET    | `/leads/{id}`             | Lead detail page (HTML)          |
| POST   | `/api/leads`              | Create a lead                    |
| GET    | `/api/leads`              | List leads (filter by tier/status)|
| GET    | `/api/leads/{id}`         | Get one lead                     |
| PATCH  | `/api/leads/{id}`         | Update lead fields / status      |
| GET    | `/api/leads/export.csv`   | Export all leads as CSV          |
| POST   | `/api/leads/import`       | Import leads from a CSV upload   |
| POST   | `/api/keys`               | Create a scoped API key          |
| GET    | `/api/keys`               | List API keys (no secrets)       |
| DELETE | `/api/keys/{id}`          | Revoke an API key                |
| GET    | `/api/analytics/summary`  | Aggregated lead analytics        |
| POST   | `/api/users`              | Create a user (admin/viewer)     |
| GET    | `/api/users`              | List users (no password data)    |
| PATCH  | `/api/users/{id}`         | Change a user's role / active    |
| DELETE | `/api/users/{id}`         | Deactivate a user                |

System:

| Method | Path       | Purpose            |
|--------|------------|--------------------|
| GET    | `/health`  | Liveness check     |
| GET    | `/docs`    | Interactive OpenAPI|

### Example: post a lead

```bash
curl -X POST "http://localhost:8000/webhook/lead?secret=dev-webhook-secret" \
  -H "Content-Type: application/json" \
  -d '{"name":"Maria Gomez","email":"maria@apextech.com",
       "organization":"Apex Technologies LLC","title":"Owner",
       "utm_source":"assessment","readinessScore":58}'
```

The webhook maps common field aliases (`name`, `organization`, `title`,
`utm_source`, `readinessScore`, `categories`, …) to the canonical lead model, so
most form/CRM payloads work without reshaping.

---

## How it works

- **Scoring** (`services/scoring.py`): additive, capped 0-100 from contact
  completeness, seniority, firmographics, and readiness intent → `hot`/`warm`/
  `cold`. The breakdown is stored and shown on the lead page.
- **Duplicate detection** (`services/dedup.py`): exact normalized email, then
  normalized phone, then a fuzzy name+company match above `DEDUP_THRESHOLD`.
- **Offer recommendations** (`services/offers.py`): maps readiness/fit to the
  GovCon offer catalog (registration → certifications → capability statement →
  proposal retainer), with a strategy-call CTA surfaced for hot leads.
- **Single intake path** (`services/intake.py`): API, webhook, and CSV import all
  run the same dedup → score → recommend → persist pipeline and log an audit
  event.

## Phase 2 features

Phase 1 is unchanged; Phase 2 (Increment 1) adds a security/infra foundation and
clean integration seams — all self-contained (no third-party accounts required).

### Database migrations (Alembic)

Schema is now managed by Alembic. Production applies migrations on startup
(`docker compose` runs `alembic upgrade head` before serving). Locally:

```bash
make migrate                      # alembic upgrade head
make migration m="add lead tags"  # autogenerate a new revision, then review it
```

For zero-setup local dev and tests, `AUTO_CREATE_TABLES=true` (the default)
still creates tables directly; set it to `false` in production.

### API keys (scoped)

Real, hashed API keys replace the need to share the admin password or webhook
secret with integrations. Create one as an admin:

```bash
curl -u admin:PASSWORD -X POST http://localhost:8000/api/keys \
  -H "Content-Type: application/json" \
  -d '{"name":"funnel","scopes":["webhook","analytics:read"]}'
# -> {"api_key":"gcle_....","...":...}   (shown once — store it now)
```

Use it via `Authorization: Bearer gcle_...` or `X-API-Key: gcle_...`. Scopes:
`webhook`, `leads:read`, `leads:write`, `analytics:read`, or `*` for all. The
legacy webhook secret and admin basic auth still work.

### User accounts & roles

Real accounts replace the single shared admin password. HTTP Basic now
authenticates against the `users` table (email + PBKDF2-hashed password) with two
roles: `admin` (manage users/keys, mutate) and `viewer` (read). The env
`ADMIN_USERNAME`/`ADMIN_PASSWORD` remain a **bootstrap login** and seed the first
admin on startup, so a fresh deploy can sign in and then create real users:

```bash
curl -u admin:PASSWORD -X POST http://localhost:8000/api/users \
  -H "Content-Type: application/json" \
  -d '{"email":"jane@theglobalconnects.com","password":"a-strong-password","role":"admin"}'
```

Manage accounts via `/api/users` (create, list, `PATCH` role/active,
`DELETE` = deactivate). Passwords are never returned or logged.

### Integration seams

`services/integrations.py` defines `Notifier`, `CRMSync`, `EmailSender`, and
`Enricher` interfaces. After persisting a lead, the single intake path enqueues
`dispatch_post_intake` on the job queue (below). Default providers make **no
external calls** — they record a `LeadEvent` so the action is visible on the lead
page. Add a real provider by implementing the Protocol, registering it in the
provider map, and selecting it via `CRM_PROVIDER` / `EMAIL_PROVIDER` /
`ENRICHMENT_PROVIDER`.

**Real provider — outbound-webhook CRM.** Set `CRM_PROVIDER=webhook` and
`CRM_WEBHOOK_URL=...` to POST every new lead as JSON to any inbound webhook
(Zapier, Make, GoHighLevel, HubSpot). It runs through the seam and the job queue,
so it never touches the request path. Failures are logged as an
`integration_error` event and never break intake.

**Real provider — SMTP email.** Set `EMAIL_PROVIDER=smtp` plus the `SMTP_*`
settings (works with Gmail, Amazon SES SMTP, Mailgun, Postmark, …). Hot leads
(score ≥ `HOT_LEAD_NOTIFY_THRESHOLD`) email the sales team at `HOT_LEAD_ALERT_TO`;
set `SEND_WELCOME_EMAIL=true` to also send the prospect a confirmation. Same
guarantees: through the seam + queue, failures never break intake.

**Real provider — HTTP enrichment.** Set `ENRICHMENT_PROVIDER=webhook` and
`ENRICHMENT_WEBHOOK_URL=...` to POST each lead to an enrichment endpoint and
merge the returned firmographics (industry, employees, annual_revenue, website,
job_title) into **empty fields only** — enrichment augments, never overwrites.
Point it at Clearbit-via-Zapier, a SAM.gov proxy, or your own service.

### Background job queue

Post-intake side effects run via a pluggable queue (`services/jobs.py`), chosen
with `JOB_QUEUE`:

- `inline` (default) — synchronous; simplest and deterministic.
- `thread` — a background thread pool, so intake returns immediately; each job
  opens its own DB session.

The `JobQueue.submit` contract lets a later increment drop in Celery/RQ with no
caller changes.

### Rate limiting & CORS

The public webhook is rate-limited per client IP (`WEBHOOK_RATE_LIMIT` per
`WEBHOOK_RATE_WINDOW_SECONDS`). CORS origins are configurable via
`CORS_ALLOW_ORIGINS` (lock to the funnel's domain in production).

### Analytics

`GET /api/analytics/summary` (scope `analytics:read` or admin) returns counts by
tier/status/source, average score, and the most-recommended offers.

### Prospect Finder (demand generation)

Finds GovCon businesses that match an ideal-customer profile from **public**
federal data, scores each for fit, and generates a UTM-tracked assessment link
plus a personalized outreach draft — the *inbound* half of the product. It does
not create leads; a prospect becomes a lead only by taking the assessment.

```bash
# Ranked prospects (JSON) — GovCon defaults, filter by state/NAICS
curl -u admin:PASSWORD "http://localhost:8000/api/prospects/find?state=GA&limit=25"
# Same as a downloadable outreach CSV
curl -u admin:PASSWORD "http://localhost:8000/api/prospects/find.csv?state=GA" -o prospects.csv
```

Set `PROSPECTING_SOURCE=usaspending` to pull real federal awardees from
USASpending.gov (no key); the default `sample` uses built-in demo data. Tracked
links point at `ASSESSMENT_BASE_URL` with `utm_source`/`utm_campaign`, and the
funnel forwards those to the engine so the dashboard shows which campaign
produced each lead. **Compliance:** this produces targets and drafts only —
sending outreach is the operator's responsibility (CAN-SPAM / platform terms).

## Configuration

All settings are environment variables (see `.env.example`). Key ones:

| Variable          | Purpose                                   | Default            |
|-------------------|-------------------------------------------|--------------------|
| `DATABASE_URL`    | Full SQLAlchemy URL (overrides POSTGRES_*)| assembled from PG_*|
| `POSTGRES_*`      | DB host/user/password/name/port           | leadengine/…       |
| `ADMIN_USERNAME`  | Dashboard/API user                        | `admin`            |
| `ADMIN_PASSWORD`  | Dashboard/API password — **change it**    | `changeme`         |
| `WEBHOOK_SECRET`  | Shared secret for `/webhook/lead`         | `dev-webhook-secret`|
| `DEDUP_THRESHOLD` | Fuzzy dedup cutoff (0-100)                | `85`               |

See `../CLAUDE.md` for architecture rules and the Phase 2 roadmap, and
`../docs/IMPLEMENTATION_CHECKLIST.md` for status.
