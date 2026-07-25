# Deploying the Lead Engine to Render

The repo ships a Render **Blueprint** (`render.yaml`) that provisions everything:
a managed PostgreSQL database and the API service (built from `backend/Dockerfile`),
with migrations run on every deploy and secrets auto-generated. Deploying is a few
clicks — no server setup.

## Prerequisites

- A [Render](https://render.com) account (free tier works to start).
- This repository on GitHub (already done) and Render connected to your GitHub.

## Deploy (first time)

1. In Render: **New +** → **Blueprint**.
2. Select this repository (`globalleader88/globaleader88`) and the branch to deploy
   (the default branch, which has all the code).
3. Render reads `render.yaml` and shows a plan: **`leadengine-db`** (Postgres) and
   **`leadengine-api`** (web service). Click **Apply**.
4. Render builds the Docker image, creates the database, runs
   `alembic upgrade head`, and starts the API. First build takes a few minutes.

> If Render rejects the `runtime: docker` key, change it to `env: docker` in
> `render.yaml` and re-sync — both have been used across Render spec versions.

## Get your credentials

Render generated your admin password and webhook secret. Find them under the
**`leadengine-api`** service → **Environment**:

- `ADMIN_PASSWORD` — log in to the dashboard with username `admin` and this value.
- `WEBHOOK_SECRET` — used by the funnel to post leads.

Rotate either by editing the value there (triggers a redeploy).

## Verify it's live

Your service URL looks like `https://leadengine-api.onrender.com`.

- Health: `GET https://<your-url>/health` → `{"status":"ok",...}`
- Dashboard: open `https://<your-url>/` and log in (`admin` / your `ADMIN_PASSWORD`).
- API docs: `https://<your-url>/docs`
- Smoke-test a lead:
  ```bash
  curl -X POST "https://<your-url>/webhook/lead?secret=<WEBHOOK_SECRET>" \
    -H "Content-Type: application/json" \
    -d '{"name":"Test Lead","email":"test@example.com","organization":"Test LLC","readinessScore":60}'
  ```
  Then refresh the dashboard — the lead should appear, scored.

## Connect the funnel

In `js/assessment.js`, set:

```js
leadEndpoint: "https://<your-url>/webhook/lead?secret=<WEBHOOK_SECRET>"
```

Deploy the static funnel anywhere (Render Static Site, Netlify, GitHub Pages, S3).
Then completed assessments flow straight into the engine, already scored.

## Production hardening (recommended)

- **Lock CORS:** set `CORS_ALLOW_ORIGINS` to your funnel's exact domain (not `*`).
- **Upgrade Postgres:** the free database expires after 90 days — move to a paid
  plan before real use.
- **Create real users:** log in and `POST /api/users` to add per-person admin
  accounts; keep `ADMIN_*` as the bootstrap login only.
- **Turn on integrations** by setting the `*_PROVIDER` vars and their config
  (e.g. `EMAIL_PROVIDER=smtp` + `SMTP_*` + `HOT_LEAD_ALERT_TO` for hot-lead alerts).

## Redeploys

Push to the deployed branch and Render rebuilds automatically, running
`alembic upgrade head` before the new version goes live. Add a new migration for
any schema change: `cd backend && make migration m="describe change"`.
