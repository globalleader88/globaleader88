# AWS provisioning for production

`provision.sh` creates everything the portal needs to run in **production** and
prints the exact environment values to paste into your host. It's the one-time
setup that turns the demo into a real, encrypted, authenticated deployment.

## What it creates

- **KMS key** (`alias/gc-portal-s3`) for S3 encryption at rest.
- **Private S3 bucket** — Block Public Access on, default SSE-KMS, versioning
  on, and a bucket policy that denies non-TLS access and unencrypted uploads.
- **Least-privilege IAM user** (`gc-portal-app`) + access key, scoped to just
  that bucket's `organizations/*` prefix, the KMS key, and the specific Bedrock
  model ARNs. (On AWS hosting, prefer an IAM **role** over a user + keys.)
- **Cognito user pool** + app client with the `USER_PASSWORD_AUTH` flow and a
  strong password policy.

It does **not** grant Bedrock model access (a one-time console step) — it checks
and reminds you.

## Run it

Easiest: open **AWS CloudShell** (already authenticated) in your target region.

```bash
cd portal/deploy/aws
AWS_REGION=us-east-1 ./provision.sh
```

Optional overrides: `BUCKET=...`, `NAME_PREFIX=...`, `CHAT_MODEL=...`, etc.

When it finishes it prints a block of `KEY=value` env vars. Paste those into your
host (Render → `gc-portal` service → **Environment**), keep `DATABASE_URL` /
`DIRECT_URL` from your managed Postgres, set a strong `SESSION_SECRET`, then
redeploy. The app's env validator will refuse to boot if anything is missing, so
a good boot means the production config is complete.

## Before you run

1. In the Bedrock console (same region), **request model access** for Claude 3.5
   Sonnet, Claude 3 Haiku, and Titan Text Embeddings V2.
2. Make sure your CLI identity can create KMS/S3/IAM/Cognito resources.

## Teardown

Delete in reverse: Cognito pool, IAM access key + user + policy, empty the S3
bucket then delete it, schedule the KMS key for deletion. (A teardown script can
be added if useful.)

See `../../../docs/portal/SECURITY.md` for the security rationale and
`../../../docs/portal/DEPLOY_RENDER.md` for the hosting steps.
