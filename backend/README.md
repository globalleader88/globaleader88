# Global Connects Lead Engine — Backend (Phase 1)

Production lead-intake service for The Global Connects Services, LLC. It ingests
leads (API, website webhook, or CSV), **scores** them, **detects duplicates**,
**recommends offers**, and serves a **basic admin dashboard**.

It is the backend for the static "Federal Contracting Readiness Assessment"
funnel in the repository root: point that funnel's `CONFIG.leadEndpoint`
(`js/assessment.js`) at this service's `/webhook/lead` route.

---

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
