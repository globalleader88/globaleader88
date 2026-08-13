# Deploying the Client Intelligence Portal to Render

The repo's Render **Blueprint** (`render.yaml`) provisions the portal alongside
the Lead Engine: a managed Postgres (`portal-db`) and the Next.js web service
(`gc-portal`), with database migrations run on every deploy and the background
job worker running **inside** the web service (so no extra paid worker is
needed). Deploying is a few clicks.

There are two modes: a zero-setup **Demo** and a **Production** deployment.

## One-click (Blueprint)

[![Deploy to Render](https://render.com/images/deploy-to-render-button.svg)](https://render.com/deploy?repo=https://github.com/globalleader88/globaleader88)

The button reads `render.yaml` from the repository's **default branch**, so
merge the portal to your default branch first (or use New → Blueprint and pick
the feature branch). For production, run the AWS setup first:
`portal/deploy/aws/provision.sh` (see `portal/deploy/aws/README.md`).

## Prerequisites

- A [Render](https://render.com) account and Render connected to your GitHub.
- This repository on GitHub.
- For production only: an AWS account with Bedrock model access, an S3 bucket +
  KMS key, and a Cognito user pool.

---

## Demo deploy (zero cloud setup)

As shipped, the Blueprint runs the portal in **demo mode**: mock AI (deterministic
offline answers), local ephemeral storage, and the dev auth adapter — so you can
click through the whole app immediately. It is **not** for real data.

1. Render → **New +** → **Blueprint** → select this repo and branch → **Apply**.
2. Render creates `portal-db` and builds `gc-portal` (first build takes a few
   minutes). Migrations run automatically (`prisma migrate deploy`), which also
   enables pgvector.
3. Your URL looks like `https://gc-portal.onrender.com`. Set
   `NEXT_PUBLIC_APP_URL` to that URL in the service's **Environment** tab and
   redeploy.
4. **Create the demo logins:** open the `gc-portal` service → **Shell** → run
   `npm run seed`. It prints the logins. The super-admin password is the
   generated `SEED_ADMIN_PASSWORD` (Environment tab); the demo org users use
   `ChangeMe!2026`.
5. Health check: `GET https://<your-url>/api/health` → `{"status":"ok"}`.

> Demo caveats: local storage is **ephemeral** (uploaded files are lost on
> redeploy/restart), the free web service **spins down when idle** (first request
> after idle is slow), and dev auth is insecure. Demo mode is enabled by
> `ALLOW_INSECURE_DEMO=true` — remove it for production.

---

## Production deploy

1. **Provision AWS** (one time):
   - **Bedrock:** request access to the Claude + Titan models in your region.
   - **S3 + KMS:** a private bucket (Block Public Access on) and a KMS key for
     SSE-KMS. Give the app's IAM principal least-privilege access to just that
     bucket prefix, the specific Bedrock model ARNs, and the KMS key (see
     `docs/portal/SECURITY.md` for an example policy).
   - **Cognito:** a user pool + app client with the `USER_PASSWORD_AUTH` flow
     enabled.
2. **Edit `render.yaml`** for the `gc-portal` service: delete the `DEMO block`
   and uncomment the `PRODUCTION block`.
3. **Set secrets in Render** (the `sync: false` keys prompt you in the
   dashboard): `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_S3_BUCKET`,
   `AWS_KMS_KEY_ID`, `COGNITO_USER_POOL_ID`, `COGNITO_CLIENT_ID`,
   `COGNITO_CLIENT_SECRET`, `COGNITO_DOMAIN`.
4. Set `NEXT_PUBLIC_APP_URL` to your real URL (custom domain recommended).
5. **Upgrade the plans**: move `portal-db` and `gc-portal` off `free`
   (free Postgres expires after 90 days; the free web service spins down and has
   limited RAM). For higher throughput, split the worker into its own service by
   setting `RUN_WORKER_IN_WEB=false` and adding a `type: worker` service that
   runs `npm run worker`.
6. Deploy. The env validator refuses to boot on unsafe production config
   (`docs/portal/DEPLOYMENT.md` lists every check), so a misconfigured deploy
   fails fast instead of leaking.

### First admin

`ADMIN_USERNAME`/`ADMIN_PASSWORD` bootstrap the first platform admin; with real
Cognito, create users through the invitation flow. See `docs/portal/DEPLOYMENT.md`
for the full AWS topology, backups, rotation, and observability.

---

## Notes

- Migrations run via the service's `preDeployCommand` (`prisma migrate deploy`).
- pgvector: enabled automatically by the first migration. If Render reports the
  `vector` extension is unavailable, ensure the database is Postgres 16.
- This is a single-region Render deployment for convenience; for a full AWS
  production topology (RDS, ECS/Fargate, CloudWatch, CloudTrail, Secrets
  Manager), follow `docs/portal/DEPLOYMENT.md`.
