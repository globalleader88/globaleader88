# Deployment Guide — Client Intelligence Portal

This document describes how to run the Global Connects **Client Intelligence
Portal** (the multi-tenant RAG platform under `portal/`) in local development
and how to deploy it to AWS. It is the Next.js/TypeScript application; it is
**not** the Python "Lead Engine" under `backend/`.

> **Scope note.** This is deployment *guidance*, not a turnkey Infrastructure-as-Code
> module. It describes the AWS resources the application expects and how they
> connect, with representative CLI/console steps. Adapt it to your own
> Terraform/CDK/CloudFormation, account structure, and security review. Nothing
> here should be treated as an authoritative compliance boundary — see the note
> on compliance at the end.

---

## 1. Prerequisites

**Local development**

- **Node.js 20+** (the `engines` field pins `>=20.0.0`).
- **Docker** and Docker Compose, for Postgres+pgvector and MinIO.
- npm (bundled with Node).

**AWS production**

- An **AWS account** with permission to create VPC, RDS, S3, KMS, Cognito,
  Bedrock, Secrets Manager, ECS/Fargate, CloudWatch, and CloudTrail resources.
- **Amazon Bedrock model access** enabled in your chosen region for the
  Anthropic Claude models and Amazon Titan embeddings the app routes to.
- A container image registry (ECR) if you deploy on ECS/Fargate.

---

## 2. Local development quickstart

The application is designed to boot with **zero cloud accounts**. Two driver
switches make this possible:

- `AI_DRIVER=mock` — uses a deterministic, hash-based embedding generator and
  canned grounded answers instead of calling Bedrock. No AWS credentials, no
  token spend.
- `STORAGE_DRIVER=local` (or `minio`) — writes document bytes to a local
  directory (`LOCAL_STORAGE_DIR`, default `.local-storage`) or to a local MinIO
  container instead of S3.

Both are the **defaults** in `src/env.ts`, so an unconfigured checkout runs
fully offline. The production guardrails in `env.ts` explicitly refuse to boot
with these values when `NODE_ENV=production` (see §6).

### 2.1 Compose services

A `docker-compose.yml` for local development should provide four services:

| Service    | Purpose                                                        |
|------------|---------------------------------------------------------------|
| `postgres` | PostgreSQL 16 with the **pgvector** extension (use the `pgvector/pgvector:pg16` image or install the extension). |
| `minio`    | S3-compatible object storage for exercising the S3 code path locally. Set `STORAGE_DRIVER=minio` and `S3_ENDPOINT` to the MinIO URL. |
| `app`      | The Next.js app (`npm run dev`).                              |
| `worker`   | The background job worker (`npm run worker`).                 |

The Postgres container must expose the database named in `DATABASE_URL`
(default `postgresql://portal:portal@localhost:5432/portal`). pgvector is
required because `DocumentChunk.embedding` is a `vector(1024)` column.

### 2.2 First run

```bash
cd portal
npm install

# Enable the pgvector extension once (the compose Postgres image may do this
# for you; otherwise connect and run):
#   CREATE EXTENSION IF NOT EXISTS vector;

# Apply the schema
npm run prisma:migrate:dev     # prisma migrate dev (creates/updates local schema)
npm run prisma:generate        # regenerate the Prisma client if needed

# Seed baseline data (organization, admin user, default settings)
npm run seed                   # tsx prisma/seed.ts

# Run the app and worker (separate terminals, or the compose services)
npm run dev
npm run worker
```

The app listens on `NEXT_PUBLIC_APP_URL` (default `http://localhost:3000`).

### 2.3 Default login

The seed script (`npm run seed` → `prisma/seed.ts`) provisions a bootstrap
organization, an admin user, and default `OrganizationSetting` /
`RetentionPolicy` rows so you can sign in immediately. The seed script prints
the bootstrap admin's email and password to the console on completion — use
those credentials for the first login and change them before exposing the
environment to anyone else.

Local sign-in uses the **dev auth adapter**, which is gated by
`ENABLE_DEV_AUTH=true`. This adapter is disabled by the production guardrail in
`env.ts`; production authenticates against **Cognito** instead (see §5.4). The
dev adapter is the only path that uses `User.devPasswordHash` (PBKDF2); that
column is never populated in production.

---

## 3. AWS production topology

```
                       ┌─────────────────────────────────────────────┐
                       │                   VPC                        │
                       │                                              │
  Cognito  ──────────► │  ┌───────────┐        ┌───────────────────┐ │
  (auth)               │  │  app       │ ─────► │  RDS Postgres 16  │ │
                       │  │ (Fargate)  │        │  + pgvector       │ │
  Bedrock ◄──────────  │  └───────────┘        └───────────────────┘ │
  (LLM+embeddings)     │        │                                     │
                       │  ┌───────────┐                               │
  S3 (SSE-KMS) ◄────── │  │  worker    │ ─────► same RDS + S3 + Bedrock│
  KMS                  │  │ (Fargate)  │                               │
  Secrets Manager      │  └───────────┘                               │
                       └─────────────────────────────────────────────┘
  CloudWatch Logs  ◄── app + worker stdout (structured JSON)
  CloudTrail       ◄── AWS API audit (management + S3/KMS data events)
```

The **app** and **worker** are the same codebase but different entrypoints
(`npm run start` vs `npm run worker`). They **must** run as separate services
so background document processing and the retention sweep run off the request
path. Both connect to the same RDS database and the same S3 bucket.

---

## 4. AWS setup — step by step

The following steps use the AWS CLI for illustration. Replace names, ARNs,
CIDRs, and regions to match your environment.

### 4.1 VPC and networking

1. Create a VPC with at least two private subnets (for RDS and the Fargate
   tasks) and, if you terminate TLS at an ALB, two public subnets for the load
   balancer.
2. Create security groups so that:
   - the app/worker tasks can reach RDS on 5432 and S3/KMS/Bedrock/Cognito via
     the internet or VPC endpoints;
   - RDS accepts connections **only** from the task security group.
3. Prefer **VPC endpoints** (Gateway endpoint for S3, Interface endpoints for
   KMS, Secrets Manager, Bedrock, and CloudWatch Logs) so traffic stays on the
   AWS network.

### 4.2 RDS PostgreSQL + pgvector

1. Create an RDS PostgreSQL **16** instance in the private subnets, encryption
   at rest enabled (KMS), not publicly accessible.
2. Enable **automated backups** and set a Point-in-Time-Recovery (PITR)
   retention window (see §8).
3. Connect once and enable pgvector:

   ```sql
   CREATE EXTENSION IF NOT EXISTS vector;
   ```

4. Set `DATABASE_URL` to the RDS connection string. If you front the database
   with a pooler (e.g. RDS Proxy / PgBouncer), point `DATABASE_URL` at the pool
   and set `DIRECT_URL` to the direct connection — Prisma uses `DIRECT_URL` for
   migrations.

### 4.3 S3 private bucket

Create a bucket for document bytes and configure it defensively:

1. **Block Public Access** — enable all four settings at the bucket (and
   ideally account) level.
2. **Default encryption: SSE-KMS** using the KMS key from §4.4. The application
   also sends SSE-KMS headers on presigned PUTs; `AWS_KMS_KEY_ID` is required in
   production (the guardrail refuses to boot without it when `STORAGE_DRIVER=s3`).
3. **Enable versioning** (supports recovery and is part of the retention story
   in `DATA_RETENTION.md`).
4. **Bucket policy denying non-TLS access:**

   ```json
   {
     "Sid": "DenyInsecureTransport",
     "Effect": "Deny",
     "Principal": "*",
     "Action": "s3:*",
     "Resource": ["arn:aws:s3:::YOUR_BUCKET", "arn:aws:s3:::YOUR_BUCKET/*"],
     "Condition": { "Bool": { "aws:SecureTransport": "false" } }
   }
   ```

5. Object keys are **server-controlled** and org-scoped
   (`organizations/{orgId}/documents/{docId}/{versionId}/{name}`); the browser
   never chooses a key. Access is via short-lived presigned URLs
   (`PRESIGNED_URL_EXPIRATION_SECONDS`, default 300).
6. Set `AWS_S3_BUCKET` to the bucket name.

### 4.4 KMS key

1. Create a symmetric KMS key for S3 object encryption (and optionally the same
   or a separate key for RDS and Secrets Manager).
2. Grant the app/worker task role `kms:GenerateDataKey` and `kms:Decrypt` on the
   key; grant S3 the standard service permissions via the key policy.
3. Set `AWS_KMS_KEY_ID` to the key id or ARN.

### 4.5 Cognito user pool

1. Create a **Cognito User Pool** and an **app client**.
2. On the app client, enable the **`USER_PASSWORD_AUTH`** auth flow — the
   `cognito-adapter` uses it, and also handles the MFA and `NEW_PASSWORD`
   challenges and the signup/confirm/forgot-password flows.
3. **MFA is optional** but recommended; the adapter handles the MFA challenge if
   the pool requires it.
4. If the app client has a secret, set `COGNITO_CLIENT_SECRET`; the adapter
   computes the `SECRET_HASH` accordingly.
5. Set `COGNITO_USER_POOL_ID`, `COGNITO_CLIENT_ID`, `COGNITO_DOMAIN`, and
   (if different from `AWS_REGION`) `COGNITO_REGION`. The production guardrail
   requires at least `COGNITO_USER_POOL_ID` and `COGNITO_CLIENT_ID`.

### 4.6 Bedrock model access

1. In the Bedrock console for your region, **enable model access** for the
   Anthropic Claude models and Amazon Titan embeddings you intend to use.
2. Confirm the model ids match the env defaults (or override them):
   - `AWS_BEDROCK_CHAT_MODEL_ID` (standard task class)
   - `AWS_BEDROCK_LOW_COST_MODEL_ID` (low task class)
   - `AWS_BEDROCK_ADVANCED_MODEL_ID` (advanced task class)
   - `AWS_BEDROCK_EMBEDDING_MODEL_ID` (default `amazon.titan-embed-text-v2:0`)
   - `AWS_BEDROCK_EMBEDDING_DIMENSION` (default `1024`) — **must** match the
     `vector(1024)` column dimension. Changing this requires a schema migration
     and re-embedding.
3. Grant the task role `bedrock:InvokeModel` and
   `bedrock:InvokeModelWithResponseStream` on the model ARNs.
4. Set `AI_DRIVER=bedrock`.

### 4.7 Secrets Manager

Store secrets in Secrets Manager and inject them into the tasks at runtime (as
ECS `secrets`), never bake them into images:

- `SESSION_SECRET` (>= 32 chars, strong and unique — the guardrail rejects the
  dev default)
- `DATABASE_URL` / `DIRECT_URL`
- `COGNITO_CLIENT_SECRET`
- Any long-lived `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` **only if** you
  are not using an IAM task role. Prefer the **task role** so no static AWS
  keys exist (leave those env vars unset).

### 4.8 ECS/Fargate services (app + worker)

Deploy two services from the same image:

- **app** — command `npm run start` (after `npm run build`). Put it behind an
  ALB with TLS; target the container port (3000). Set `NEXT_PUBLIC_APP_URL` to
  the public HTTPS URL.
- **worker** — command `npm run worker`. No inbound listener; it polls the
  `ProcessingJob` table (`DOCUMENT_PROCESSING`, `RETENTION_SWEEP`). Give it a
  distinct `JOB_WORKER_ID` per running task so lock ownership is unambiguous.

Both services share the task role, the RDS/S3/Bedrock/Cognito configuration, and
the CloudWatch log configuration. Run migrations as a **one-off task** (§7)
before rolling the app forward.

> ECS/Fargate is one option. Any orchestrator that can run two long-lived
> Node processes, inject secrets, and reach the data stores works — the
> requirement is simply "an app service and a separate worker service."

### 4.9 CloudWatch and CloudTrail

- Create **CloudWatch log groups** for the app and worker and point the task
  log configuration at them. Logs are structured JSON with secret/PII/content
  redaction (`lib/logger.ts`); do not add logging that bypasses the redactor.
- Enable **CloudTrail** for management events, and enable **S3 and KMS data
  events** on the document bucket and key so object access is auditable. This is
  the AWS-level audit trail; the application also keeps an append-only
  `AuditLog` table for tenant-facing actions.

---

## 5. Environment variables reference

Authoritative source: `portal/src/env.ts`. Validation runs once at module load;
in production, missing/insecure values throw immediately (fail fast).

| Variable | Prod requirement | Dev default | Notes |
|---|---|---|---|
| `NODE_ENV` | set `production` | `development` | Turns on the production guardrails. |
| `DATABASE_URL` | **required** | local Postgres | Prisma runtime connection. |
| `DIRECT_URL` | recommended | (unset) | Direct connection for migrations when pooling. |
| `NEXT_PUBLIC_APP_URL` | **required** | `http://localhost:3000` | Public HTTPS URL in prod. |
| `SESSION_SECRET` | **required (strong, ≥32)** | dev placeholder | Guardrail rejects the `dev-session-secret…` default. |
| `LOG_LEVEL` | optional | `info` | `debug`/`info`/`warn`/`error`. |
| `ENABLE_DEV_AUTH` | **must be `false`** | `true` | Dev auth adapter; guardrail forbids `true` in prod. |
| `AWS_REGION` | set to your region | `us-east-1` | |
| `AWS_ACCESS_KEY_ID` | optional (prefer task role) | (unset) | Omit when using an IAM role. |
| `AWS_SECRET_ACCESS_KEY` | optional (prefer task role) | (unset) | Omit when using an IAM role. |
| `STORAGE_DRIVER` | **`s3`** (or `minio`) | `local` | Guardrail forbids `local` in prod. |
| `AWS_S3_BUCKET` | **required** | `gc-portal-dev` | Document bucket. |
| `AWS_KMS_KEY_ID` | **required when `s3`** | (unset) | SSE-KMS key; guardrail enforces. |
| `S3_ENDPOINT` | unset (MinIO only) | (unset) | Set for MinIO local dev. |
| `S3_FORCE_PATH_STYLE` | `false` for S3 | `true` | MinIO needs path-style. |
| `LOCAL_STORAGE_DIR` | n/a | `.local-storage` | Local driver only. |
| `PRESIGNED_URL_EXPIRATION_SECONDS` | optional | `300` | Short-lived URL TTL. |
| `MAX_UPLOAD_SIZE_MB` | optional | `50` | Upload size cap. |
| `AI_DRIVER` | **`bedrock`** | `mock` | Guardrail forbids `mock` in prod. |
| `AWS_BEDROCK_CHAT_MODEL_ID` | optional | Claude 3.5 Sonnet | Standard task class. |
| `AWS_BEDROCK_LOW_COST_MODEL_ID` | optional | Claude 3 Haiku | Low task class. |
| `AWS_BEDROCK_ADVANCED_MODEL_ID` | optional | Claude 3.5 Sonnet | Advanced task class. |
| `AWS_BEDROCK_EMBEDDING_MODEL_ID` | optional | Titan Embed v2 | |
| `AWS_BEDROCK_EMBEDDING_DIMENSION` | optional | `1024` | Must match `vector(1024)`. |
| `COGNITO_USER_POOL_ID` | **required** | (unset) | Guardrail enforces. |
| `COGNITO_CLIENT_ID` | **required** | (unset) | Guardrail enforces. |
| `COGNITO_CLIENT_SECRET` | if app client has one | (unset) | |
| `COGNITO_DOMAIN` | recommended | (unset) | |
| `COGNITO_REGION` | if ≠ `AWS_REGION` | (unset) | |
| `DEFAULT_MONTHLY_TOKEN_LIMIT` | optional | `5000000` | Seeds `OrganizationSetting`. |
| `DEFAULT_DAILY_QUERY_LIMIT` | optional | `200` | Seeds `OrganizationSetting`. |
| `CHUNK_TARGET_TOKENS` | optional | `700` | Chunker target. |
| `CHUNK_OVERLAP_TOKENS` | optional | `100` | Chunk overlap. |
| `RATE_LIMIT_WINDOW_SECONDS` | optional | `60` | Fixed-window limiter. |
| `RATE_LIMIT_MAX_REQUESTS` | optional | `60` | Requests per window. |
| `INVITATION_EXPIRY_HOURS` | optional | `72` | Invite token TTL. |
| `JOB_WORKER_ID` | set per worker | `worker-local` | Distinguishes lock owners. |

> The rate limiter (`lib/ratelimit.ts`) is an in-memory fixed window suitable
> for a single instance. If you run more than one app instance, replace it with
> a shared store; per-instance windows do not enforce a global limit.

---

## 6. Production guardrails (fail-fast)

`env.ts` throws at boot in `NODE_ENV=production` if any of the following hold:

- `ENABLE_DEV_AUTH` is true;
- `SESSION_SECRET` still starts with `dev-session-secret`;
- `AI_DRIVER` is `mock`;
- `STORAGE_DRIVER` is `local`;
- `STORAGE_DRIVER` is `s3` but `AWS_KMS_KEY_ID` is unset;
- `COGNITO_USER_POOL_ID` or `COGNITO_CLIENT_ID` is missing.

A misconfigured production deploy therefore refuses to start rather than
serving traffic with dev auth, mock AI, unencrypted local storage, or no SSO.

---

## 7. Running migrations and the worker in production

**Migrations.** The schema source of truth is Prisma migrations. Apply them
with a one-off task/job that runs **before** the new app version serves
traffic:

```bash
npm run prisma:migrate      # prisma migrate deploy
```

`migrate deploy` applies committed migrations only (it never generates or
prompts). Run it against `DIRECT_URL` if you pool connections. Never point it
at a database whose pgvector extension is not installed — do the
`CREATE EXTENSION vector` step first (§4.2).

**Worker.** Deploy the worker as its own long-running service:

```bash
npm run worker              # tsx src/lib/jobs/worker-runner.ts
```

It claims jobs with a lock token (idempotent — one worker per job), retries with
backoff, reclaims stale jobs periodically, and dispatches by `JobType`
(`DOCUMENT_PROCESSING`, `RETENTION_SWEEP`). Schedule the retention sweep by
enqueuing a `RETENTION_SWEEP` `ProcessingJob` on a cadence (e.g. an EventBridge
rule that inserts a job, or a small scheduled task) — see `DATA_RETENTION.md`.

---

## 8. Zero-downtime, rotation, and backups

**Zero-downtime rollout.** Because the app is stateless (session state lives in
the sealed iron-session cookie and in Postgres), deploy with a rolling or
blue/green update behind the ALB. Order: run `migrate deploy` (write
backward-compatible migrations), then roll app tasks, then roll worker tasks.
Keep migrations additive across a deploy so old and new tasks can run
simultaneously.

**Secret rotation.**
- `SESSION_SECRET` — rotating it invalidates existing sealed cookies (users
  re-authenticate). Rotate during a maintenance window or accept forced
  re-login.
- Cognito app client secret, database credentials, and KMS key policy — rotate
  in Secrets Manager / IAM and roll the tasks to pick up new values.
- Prefer IAM **task roles** over static AWS keys so there is nothing to rotate
  for AWS API access.

**Backups.**
- **RDS**: enable automated backups and set a PITR retention window sized to
  your recovery and retention requirements. Optionally take periodic manual
  snapshots for longer retention. (See `DATA_RETENTION.md` for how backup
  windows interact with application-level deletion — deleted data can persist in
  backups until the window lapses.)
- **S3**: keep **versioning** on and add a **lifecycle policy** to expire
  non-current (and delete-marker) versions after your chosen window, and
  optionally transition older versions to cheaper storage classes.

---

## 9. Health checks and observability

- **Liveness/readiness**: expose the ALB health check at a lightweight app
  route and treat "process up + can reach Postgres" as healthy. The worker has
  no listener; monitor it via job throughput and CloudWatch metrics instead.
- **Logs**: structured JSON to stdout → CloudWatch, with redaction of secrets,
  PII, document content, prompts, and tokens (`lib/logger.ts`). Build
  dashboards/alarms on log fields (`action`, `status`, `organizationId`,
  `resourceId`).
- **Job health**: alarm on `ProcessingJob` rows stuck in `FAILED`/`RETRYING` or
  growing `QUEUED` depth, and on worker crash logs (`worker.crashed`).
- **Cost/usage**: `UsageRecord` powers per-org usage and cost dashboards — see
  `COST_CONTROLS.md`.
- **Audit**: the append-only `AuditLog` table plus CloudTrail S3/KMS data events
  give application- and infrastructure-level trails.

---

## 10. A note on compliance

This codebase provides technical controls (tenant isolation, encryption in
transit and at rest, least-privilege auth, audit logging, retention/purge,
usage limits). It does **not** by itself make a deployment compliant with
CMMC, FedRAMP, NIST 800-171, HIPAA, SOC 2, ITAR, or CUI handling requirements.
Compliance depends on your infrastructure configuration, organizational
policies, contracts, personnel, physical and network controls, and operating
procedures. Treat this guide as a starting point and validate any regulated
deployment with the appropriate assessors.
