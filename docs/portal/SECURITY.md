# Security Controls — Global Connects Client Intelligence Portal

Status: Living document. Describes the technical security controls implemented in
the `portal/` Next.js application and the infrastructure they assume. Read
`THREAT_MODEL.md` alongside this document.

This platform is a **multi-tenant, AI-assisted document-intelligence (RAG)**
service. Client organizations upload confidential documents and query them
through a retrieval-augmented LLM. Its defining security requirement is **tenant
isolation**, backed by defense-in-depth across transport, storage, database, and
prompt construction.

> **Compliance note up front:** implementing these controls does **not** make the
> platform automatically compliant with any regulatory framework. See
> [§11 Compliance readiness](#11-compliance-readiness).

---

## 1. Controls inventory (at a glance)

| Area | Control | Where |
|------|---------|-------|
| Transport | TLS everywhere (browser↔app, app↔AWS) | Infra / AWS SDK |
| At rest | S3 SSE-KMS; RDS encryption; KMS-managed keys | `storage/index.ts`, RDS config |
| Buckets | Private, no public access; org-prefixed keys | `storage/keys.ts` |
| IAM | Least privilege, scoped to bucket prefix + model + KMS key | §4 (example policy) |
| AuthN | Cognito (prod), sealed session cookie | `lib/auth/`, `env.ts` |
| AuthZ | Server-side org resolution + role gate | `lib/authz/index.ts` |
| Headers/CSP | Secure headers, CSP | App config / middleware |
| CSRF | Server actions + `sameSite=lax` cookie | `lib/auth/session` |
| XSS | React auto-escaping + CSP; content never rendered as HTML | App |
| SQL injection | Prisma parameterization; parameterized raw SQL | `rag/vectors.ts` |
| Input validation | Zod schemas on all inputs; file validation | `lib/documents/validation`, forms |
| Rate limiting | Fixed-window limiter | `lib/ratelimit.ts` |
| Usage limits | Per-org token + per-user query caps | `lib/usage/limits.ts` |
| Cookies | httpOnly, secure, sameSite=lax, sealed, 8h TTL | `lib/auth/session` |
| Presigned URLs | Short expiry (default 300s), org-validated | `storage/index.ts` |
| Logging | Structured JSON + redaction | `lib/logger.ts` |
| Audit | Append-only AuditLog + CloudTrail | `lib/audit.ts` |
| Secrets | Env (dev), Secrets Manager (prod); rotation-ready | `env.ts` |
| Config safety | Prod boot refuses insecure config | `env.ts` |

---

## 2. Transport security (TLS / in transit)

- All client↔application traffic is served over HTTPS/TLS (terminated by the
  load balancer / platform in front of the Next.js app). HSTS should be enabled
  at the edge.
- All application↔AWS traffic (S3, RDS, Bedrock, Cognito, KMS, Secrets Manager)
  uses the AWS SDKs over TLS by default.
- Database connections use TLS to RDS (`DATABASE_URL` / `DIRECT_URL` configured
  with `sslmode=require` in production).

---

## 3. Encryption at rest

- **S3 objects:** written with server-side encryption. When `AWS_KMS_KEY_ID` is
  set (required in production), objects use `SSE-KMS`
  (`x-amz-server-side-encryption: aws:kms` + the configured key id); otherwise
  `AES256` (SSE-S3) in dev. See `sseHeaders()` and the `PutObjectCommand`
  parameters in `storage/index.ts`. The production env guard (`env.ts`) refuses
  to boot an `s3` driver without `AWS_KMS_KEY_ID`.
- **RDS/PostgreSQL:** storage encryption enabled at the RDS instance level (KMS).
  This is infrastructure configuration, not application code.
- **KMS:** customer-managed key with a scoped key policy (see §4). Enable
  automatic annual key rotation on the CMK.

---

## 4. IAM least privilege

The application's execution role should grant **only** the S3 prefix, Bedrock
models, and KMS key it actually uses. Example scoped policy (replace ARNs/IDs):

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "PortalObjectsInBucketPrefix",
      "Effect": "Allow",
      "Action": ["s3:GetObject", "s3:PutObject", "s3:DeleteObject"],
      "Resource": "arn:aws:s3:::gc-portal-prod/organizations/*"
    },
    {
      "Sid": "PortalListBucketScoped",
      "Effect": "Allow",
      "Action": ["s3:ListBucket"],
      "Resource": "arn:aws:s3:::gc-portal-prod",
      "Condition": { "StringLike": { "s3:prefix": ["organizations/*"] } }
    },
    {
      "Sid": "BedrockInvokeSpecificModels",
      "Effect": "Allow",
      "Action": ["bedrock:InvokeModel", "bedrock:InvokeModelWithResponseStream"],
      "Resource": [
        "arn:aws:bedrock:us-east-1::foundation-model/anthropic.claude-3-5-sonnet-20240620-v1:0",
        "arn:aws:bedrock:us-east-1::foundation-model/anthropic.claude-3-haiku-20240307-v1:0",
        "arn:aws:bedrock:us-east-1::foundation-model/amazon.titan-embed-text-v2:0"
      ]
    },
    {
      "Sid": "KmsForS3ObjectEncryption",
      "Effect": "Allow",
      "Action": ["kms:Encrypt", "kms:Decrypt", "kms:GenerateDataKey"],
      "Resource": "arn:aws:kms:us-east-1:111122223333:key/REPLACE-WITH-CMK-ID",
      "Condition": {
        "StringEquals": { "kms:ViaService": "s3.us-east-1.amazonaws.com" }
      }
    },
    {
      "Sid": "SecretsManagerReadAppSecrets",
      "Effect": "Allow",
      "Action": ["secretsmanager:GetSecretValue"],
      "Resource": "arn:aws:secretsmanager:us-east-1:111122223333:secret:gc-portal/*"
    }
  ]
}
```

Notes:
- The bucket is **private** with S3 Block Public Access on. No object is ever
  publicly readable; access is only via short-lived presigned URLs (§9) issued by
  the app after an org-ownership check.
- Bedrock is scoped to the exact model ARNs the app uses (chat, low-cost,
  embeddings). Do not grant `bedrock:*` or `Resource: *`.
- The KMS grant is constrained to use via S3 (`kms:ViaService`).
- Prefer separate least-privilege DB roles for the app rather than a superuser.

---

## 5. Authentication

- **Production:** Amazon Cognito (`USER_PASSWORD_AUTH`, with MFA and
  `NEW_PASSWORD`/challenge handling, signup/confirm/forgot flows). Cognito owns
  credential verification and password policy.
- **Sessions:** `iron-session` sealed (encrypted + authenticated) cookie carrying
  `{ userId, activeOrganizationId(hint) }` only — `httpOnly`, `secure`,
  `sameSite=lax`, **8-hour TTL**. Tampering breaks the seal; the cookie carries no
  role or org claim that could be forged to gain access.
- **Session expiration:** enforced by the 8h TTL plus a per-request user re-load
  that rejects deleted/suspended users (`requireAuthenticatedUser`).
- **Dev auth:** the local password/dev adapter (PBKDF2 for dev passwords,
  SHA-256 for token hashing) is **disabled in production** by the `ENABLE_DEV_AUTH`
  env guard; `env.ts` refuses to boot production with it enabled.

---

## 6. Authorization (tenant isolation)

All access to client-owned data starts in `lib/authz/index.ts`:

- `getAuthorizedOrganization` resolves the active org **server-side** from
  authenticated user × live `OrganizationMembership` (ACTIVE) × session hint. The
  browser never supplies `organizationId`.
- `requireOrganizationMembership({ minRole })` blocks suspended orgs/users and
  enforces the role hierarchy `VIEWER < ANALYST < ADMIN`.
- `assertDocumentAccess` / `assertConversationAccess` return **404, not 403** on
  cross-tenant references, preventing existence disclosure.
- Vector search (`rag/vectors.ts`) filters on `organizationId` unconditionally in
  SQL. Storage keys are org-prefixed and validated (`storage/keys.ts`).

See `THREAT_MODEL.md` for the full mapping.

---

## 7. Web application hardening

- **Secure headers / CSP:** a Content-Security-Policy and standard security
  headers (`X-Content-Type-Options: nosniff`, `Referrer-Policy`,
  `X-Frame-Options`/frame-ancestors, HSTS at the edge) should be applied via the
  Next.js config/middleware. CSP restricts script sources and mitigates XSS and
  clickjacking.
- **CSRF:** state-changing operations use Next.js **server actions**, and the
  session cookie is `sameSite=lax`, which blocks cross-site cookie-driven
  requests. Do not expose unauthenticated state-changing GET endpoints.
- **XSS:** React escapes rendered values by default; document content is rendered
  as text/markdown, never injected as raw HTML. Combined with CSP, this closes
  the common stored-XSS-via-document vector. Avoid `dangerouslySetInnerHTML`.
- **SQL injection:** Prisma parameterizes all standard queries. The two raw SQL
  paths (pgvector insert/search) use `Prisma.sql` tagged templates with bound
  parameters; the vector literal is built from server-produced numbers, never
  concatenated user strings (`rag/vectors.ts`). **Rule:** any future raw SQL must
  use tagged-template parameters — never string concatenation of input.
- **Input validation:** all external input (forms, server-action args, route
  bodies) is validated with **Zod**. Environment configuration is validated with
  Zod at boot (`env.ts`). File uploads are validated separately (§10).

---

## 8. Rate limiting and usage/cost controls

- **Rate limiting:** `lib/ratelimit.ts` — in-memory fixed-window limiter on
  public webhook/API paths (`RATE_LIMIT_WINDOW_SECONDS`,
  `RATE_LIMIT_MAX_REQUESTS`). MVP limitation: in-memory state is per-instance;
  replace with a shared store (Redis/DynamoDB) before running multiple instances.
- **Usage limits:** `lib/usage/limits.ts` — per-org **monthly token limit** and
  per-user **daily query limit** as hard stops, with a warn threshold;
  `recordUsage` records micro-USD cost per call. These bound both abuse and spend.

---

## 9. Presigned URLs and object access

- Upload/download use **short-lived presigned URLs**
  (`PRESIGNED_URL_EXPIRATION_SECONDS`, default **300s**).
- Every download URL is issued via `presignOrgDownload`, which calls
  `assertKeyBelongsToOrg` first — the key must start with the caller's
  `organizations/{orgId}/` prefix and contain no `..`.
- Uploads presign a `PutObject` with SSE-KMS headers so the client cannot store an
  unencrypted object.
- URLs are never written to logs (they are not part of the curated log context).

---

## 10. File validation

`lib/documents/validation` enforces, before processing:

- **Allow-list** of types: PDF, DOCX, TXT, CSV, XLSX.
- **Size cap:** `MAX_UPLOAD_SIZE_MB` (default 50).
- **MIME/extension cross-check** and **magic-byte sniff** — the declared type
  must match the actual bytes.
- The processing pipeline is **idempotent** and re-sniffs content during
  extraction. File names are sanitized before use in storage keys (§6).

---

## 11. Audit logging

- `lib/audit.ts` writes **append-only** `AuditLog` entries (with `AuditAction`
  constants) on intake, access, and mutation paths, recording actor, org, and
  action. Writes are **best-effort**: an audit failure never breaks the primary
  action.
- **CloudTrail** independently records AWS-side data-plane and management access
  (S3, KMS, Cognito) for infrastructure-level auditing.
- Hardening: enforce true immutability with DB-level `REVOKE UPDATE/DELETE` on the
  audit table and/or periodic WORM export.

---

## 12. Logging redaction policy

`lib/logger.ts` emits structured JSON (shipped to CloudWatch in production) and
**never logs**:

- Passwords or password hashes (`password`, `devpasswordhash`).
- Secrets and credentials (`secret`, `token`, `accesstoken`, `authorization`,
  `awssecretaccesskey`, `aws_secret_access_key`, `databaseurl`, `database_url`).
- Hashes of keys/tokens (`keyhash`, `tokenhash`).
- **Document content, prompts, excerpts, and embeddings** (`content`, `prompt`,
  `excerpt`, `embedding`).

Redaction is by key name (case-insensitive denylist) and any string over 512
chars is truncated. Callers pass a small curated context object (`requestId`,
`userId`, `organizationId`, `action`, `status`) — never raw payloads. When adding
log fields, avoid new names that could carry sensitive values, or extend
`SENSITIVE_KEYS`.

---

## 13. Secrets management

- **Development:** configuration via `.env` / environment variables, validated by
  `env.ts` (Zod). Dev defaults are generous so the app boots with `docker compose
  up` and no cloud account (mock AI, local storage, dev auth).
- **Production:** secrets (DB URL, session secret, Cognito client secret, AWS
  credentials via instance role) sourced from **AWS Secrets Manager** / the
  execution role, injected as environment at deploy time.
- **Boot-time guardrails (`env.ts`):** in `NODE_ENV=production` the app refuses to
  start if dev auth is enabled, the session secret is still the dev default, the
  AI driver is `mock`, storage is `local`, KMS is missing for S3, or Cognito is
  unconfigured.
- **Rotation readiness:** secrets are read from the environment/Secrets Manager,
  not hard-coded, so rotating a value (session secret, DB password, Cognito
  secret, AWS keys, KMS CMK) is a config/redeploy operation. Enable Secrets
  Manager rotation schedules and KMS automatic key rotation. Rotating
  `SESSION_SECRET` invalidates existing sealed sessions (users re-authenticate).

---

## 14. Backups and data lifecycle

Application-level deletion and infrastructure backups are **separate** concerns —
one does not instantly erase the other:

- **Application soft-delete + purge (`lib/retention.ts`):** documents,
  conversations, and reports carry `deletedAt`. `softDeleteDocument` removes
  embeddings immediately; a retention sweep soft-deletes rows past
  `retentionDate` (unless `legalHold`) and, past a grace window, **purges** —
  deleting S3 objects, versions, and chunks.
- **RDS backups / PITR:** RDS automated backups and point-in-time-recovery retain
  data for the configured window (e.g., 7–35 days). Data purged in the app may
  still exist in a backup snapshot until that window rolls off. This is expected
  and is what enables disaster recovery.
- **S3 versioning / lifecycle:** if bucket versioning is enabled, deleting an
  object creates a delete marker; prior versions persist until a lifecycle rule
  expires them. Configure lifecycle rules to age out noncurrent versions in line
  with your retention policy.

Operators must reconcile contractual data-deletion commitments with backup/PITR
windows and S3 lifecycle configuration; the application cannot force-expire a
backup snapshot.

---

## 15. Incident response (placeholder)

> **TODO — operator to complete.** This section is a placeholder and must be
> filled in with organization-specific procedures before production use.

- **Reporting:** define an internal channel and on-call rotation.
- **Triage/severity:** classify (data exposure, availability, integrity).
- **Containment:** suspend affected org/user (`status = SUSPENDED`), rotate
  affected secrets (§13), revoke presigned access by rotating keys, disable
  affected API keys.
- **Evidence:** preserve `AuditLog`, CloudWatch, and CloudTrail records.
- **Notification:** follow contractual and legal breach-notification obligations.
- **Post-incident:** root-cause analysis and control improvements.

---

## 16. Vulnerability reporting (placeholder)

> **TODO — operator to complete.**

- **Contact:** publish a security contact (e.g., `security@<domain>`) and, if
  applicable, a `SECURITY.txt` / disclosure policy.
- **Scope + safe harbor:** state what is in scope and the terms for good-faith
  research.
- **SLA:** define acknowledgement and remediation timelines.

---

## 17. Compliance readiness

**This platform is NOT automatically compliant with CMMC, FedRAMP, NIST
SP 800-171, HIPAA, SOC 2, ITAR, or any CUI-handling mandate.** Deploying this
codebase does not confer certification or authorization under any of these
frameworks.

Compliance is a property of a **whole system and organization**, not of source
code. Whether a given deployment can meet a framework depends on:

- **Configuration** — how AWS, Cognito, KMS, RDS, networking, and this app are
  actually set up in a specific environment.
- **Infrastructure** — account boundaries, region (e.g., GovCloud for certain
  regimes), network isolation, endpoint protection.
- **Policies** — data classification, access management, retention, incident
  response, change management.
- **Contracts** — DPAs, BAAs (HIPAA), flow-down clauses (DFARS/CMMC), export
  agreements (ITAR).
- **Personnel** — background screening, citizenship requirements (ITAR/CUI),
  training, separation of duties.
- **Operating procedures** — monitoring, auditing, vulnerability management,
  backup testing, continuous compliance evidence.

What this codebase provides is a set of **technical controls that can serve as a
starting point** toward those frameworks. It does not provide the administrative,
physical, or procedural controls, nor the assessment/authorization evidence, that
certification requires.

### Control-mapping table (starting point only)

| Technical control (implemented) | Relevant control families (illustrative) |
|---------------------------------|-------------------------------------------|
| Cognito authN + sealed session, 8h TTL | Access Control, Identification & Authentication |
| Server-side tenant isolation, role hierarchy, 404-not-403 | Access Control, System & Comm. Protection |
| Append-only AuditLog + CloudTrail | Audit & Accountability |
| Structured logging with redaction | Audit & Accountability, System & Info Integrity |
| SSE-KMS at rest; TLS in transit | System & Comm. Protection, Media Protection |
| Private buckets + org-prefixed, validated keys | Access Control, Media Protection |
| Least-privilege IAM (bucket prefix, model, KMS) | Access Control, Config Management |
| Zod input validation + file type/size/sniff | System & Info Integrity |
| Rate limiting + usage/cost caps | System & Comm. Protection (resource availability) |
| Boot-time secure-config enforcement (`env.ts`) | Configuration Management |
| Secrets in env/Secrets Manager, rotation-ready | Config Management, Identification & Authentication |
| Retention/soft-delete/purge + backup lifecycle | Media Protection, Contingency Planning |
| Prompt-injection defenses (untrusted-data framing) | System & Info Integrity |

The mapping above is **indicative**, not an attestation. A qualified assessor
must evaluate a specific deployment against the specific control catalog.

### GovCon feature status (accuracy note)

The GovCon-specific capabilities (solicitation analysis, FAR/DFARS extraction,
compliance matrices, proposal outlines, past-performance, capability statements,
pricing workbooks, bid/no-bid, subcontractor documents) are **designed-for via
clean extension points** (the `ReportType` enum, `ClassificationLevel`, and a
generic document model) but are **not fully implemented**. Do not represent them
as complete.
