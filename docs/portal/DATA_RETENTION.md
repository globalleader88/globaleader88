# Data Retention & Deletion — Client Intelligence Portal

This document describes how the portal retains, soft-deletes, purges, and
exports tenant data, and — importantly — how application-level deletion relates
to infrastructure backups. The authoritative code is
`src/lib/retention.ts`, with the data model in `prisma/schema.prisma`
(`RetentionPolicy`, `Document`, `DocumentVersion`, `DocumentChunk`, `AuditLog`).

---

## 1. Retention policy model

Each organization has at most one **`RetentionPolicy`** row:

| Field | Type / default | Meaning |
|---|---|---|
| `mode` | `RetentionMode` = `INDEFINITE` | `INDEFINITE` keeps documents until explicitly deleted; `DELETE_AFTER_DAYS` applies age-based retention. |
| `retentionDays` | `Int?` | Used with `DELETE_AFTER_DAYS`: how long a document is retained before it is due for soft-deletion. |
| `purgeGraceDays` | `Int` = `7` | Grace window between soft-delete and permanent purge of S3 objects, versions, and chunks. |
| `legalHold` | (per-document, see §6) | Suspends both soft-delete and purge for held documents. |

Per-document controls on **`Document`**:

- `retentionDate` (`DateTime?`) — the concrete due date the sweep honors. A
  policy in `DELETE_AFTER_DAYS` mode sets this from `retentionDays`; it can also
  be set explicitly.
- `legalHold` (`Boolean`, default `false`) — when true, the document is exempt
  from both retention phases (§6).
- `deletedAt` (`DateTime?`) and `status` — track the soft-delete/purge lifecycle.

> `INDEFINITE` means "no automatic expiry"; documents persist until a user
> deletes them or a `retentionDate` is set. Choose `DELETE_AFTER_DAYS` with a
> `retentionDays` value to enforce time-based disposal per tenant.

---

## 2. Deletion lifecycle

Deletion is **two-phase** by design, so an accidental or premature deletion has
a recovery window before bytes are destroyed.

### Phase 1 — Soft delete

`softDeleteDocument(orgId, documentId)`:

1. Sets `deletedAt = now()` and `status = 'DELETED'` on the document (scoped to
   the org; only if not already deleted).
2. **Immediately deletes all `DocumentChunk` rows** for that document —
   including their pgvector embeddings. This is the key retrieval-safety
   property: **a soft-deleted document is excluded from retrieval the instant it
   is soft-deleted**, because vector search only matches existing, non-deleted,
   `READY` chunks. There is no window in which deleted content can still surface
   in an answer.
3. Writes a `DOCUMENT_DELETED` audit event with the reason
   (`manual`, `retention`, etc.).

At this point the original bytes still exist in S3 (recoverable during the grace
window), but the content is no longer retrievable by the RAG pipeline.

### Phase 2 — Purge (after the grace window)

`purgeDocument(orgId, documentId)` permanently removes the data:

1. For every `DocumentVersion`, deletes the S3 object at its server-controlled
   key (`storage.deleteObject`). Failures are logged and do not abort the purge
   of the remaining versions.
2. Deletes the `Document` row; foreign-key cascades remove its
   `DocumentVersion` and any remaining `DocumentChunk` rows.

After purge, the document, its versions, its chunks/embeddings, and its S3
objects are gone from the live system.

### Deletion audit events

Both phases are observable. Soft-delete writes an append-only `AuditLog` entry
(`DOCUMENT_DELETED`) with a non-sensitive reason; purge failures on individual
S3 objects are logged (`retention.purge_object_failed`) without exposing
content. `AuditLog` is append-only from the application's perspective (no update
or delete paths) so the deletion trail cannot be quietly rewritten.

---

## 3. The retention sweep job

`runRetentionSweep()` performs both phases and is dispatched by the worker as a
`RETENTION_SWEEP` `ProcessingJob` (`src/lib/jobs/worker.ts`):

1. **Phase 1** — finds documents where `deletedAt IS NULL`,
   `legalHold = false`, and `retentionDate <= now`, and soft-deletes each
   (reason `retention`).
2. **Phase 2** — finds soft-deleted, non-held documents and purges any whose
   `deletedAt + purgeGraceDays` has passed. The grace comes from the org's
   `RetentionPolicy.purgeGraceDays`, defaulting to **7 days** when no policy row
   exists.

It returns `{ softDeleted, purged }` and logs a `retention.sweep` summary.

**Scheduling.** The worker runs `RETENTION_SWEEP` jobs when they are enqueued;
it does not self-schedule. Enqueue one on a cadence (e.g. daily) via an
EventBridge rule or scheduled task that inserts a `ProcessingJob` of type
`RETENTION_SWEEP`. Because jobs are claimed with a lock, a duplicate enqueue is
safe — only one worker runs a given job.

---

## 4. Organization data export (documented feature)

The data model reserves a `DATA_EXPORT` `JobType` for producing a
per-organization export of a tenant's data (documents, conversations, reports,
usage, audit). This is a **documented, designed-for** capability and a clean
extension point: the enum and job plumbing exist, but the export handler is not
yet wired into the worker dispatcher (unhandled job types are completed as
skipped). When implemented, an export should:

- run as a `DATA_EXPORT` `ProcessingJob`, scoped strictly to a single
  `organizationId` (never cross-tenant);
- read through the same authorization boundary as the rest of the app;
- write the export to a short-lived, access-controlled S3 location and hand the
  requester a short-lived presigned URL;
- record an audit event for the export.

Until the handler ships, treat organization export as a roadmap item, not a
present guarantee.

---

## 5. Secure organization / account deletion workflow

Deleting an entire organization or user account should follow the same
two-phase discipline and rely on the schema's cascade relationships:

1. **Suspend / soft-delete first.** Set the org or user to `SUSPENDED` /
   `deletedAt` so access stops immediately. Membership checks block suspended
   orgs and users, and soft-deleted documents drop out of retrieval at once
   (§2).
2. **Purge documents.** Run purge for the org's documents so S3 objects,
   versions, and chunks are removed (§2, phase 2). Do this before removing the
   parent rows so object deletion is explicit and audited, rather than relying
   solely on row cascades.
3. **Remove records.** Deleting an `Organization` cascades to memberships,
   invitations, documents, chunks, conversations, messages, citations, reports,
   usage records, processing jobs, settings, retention policy, and API keys
   (per the `onDelete: Cascade` foreign keys). `AuditLog` is intentionally
   `SetNull` on org/user so the audit trail survives the deletion.
4. **Audit the deletion.** Record who initiated it and when.

Honor any active **legal hold** before purging (§6), and confirm no export or
legal obligation requires the data before destroying it.

---

## 6. Legal hold

`legalHold = true` on a `Document` makes it exempt from **both** retention
phases: the sweep's Phase 1 query excludes held documents
(`legalHold: false`), and Phase 2 purge candidates are likewise filtered to
`legalHold: false`. A held document is therefore never auto-soft-deleted and
never purged by the sweep, even if its `retentionDate` has passed or it was
already soft-deleted. Clear the hold to allow normal retention processing to
resume. Legal hold should be set and cleared through an audited administrative
action, and reviewed as part of any org/account deletion (§5).

---

## 7. Backups: application deletion is not backup deletion

**Application-level soft-delete and purge remove data from the *live* system.
They do not, and cannot, instantly remove copies that already exist in
infrastructure backups.** Deleted data may persist in backups until the
configured backup retention windows lapse. This is expected behavior; plan
retention windows accordingly.

Where residual copies live and how to bound them:

- **RDS automated backups / PITR.** RDS retains automated backups and
  point-in-time-recovery data for the configured **backup retention period**.
  Rows deleted in the database (chunks, metadata, purged documents) can be
  restored from any recovery point within that window until it rolls off.
  Configure the window on the RDS instance (`BackupRetentionPeriod`); shorten it
  to reduce residual retention, lengthen it for recoverability. Manual/final
  snapshots persist until you explicitly delete them.
- **S3 versioning.** With bucket versioning enabled, deleting an object creates
  a delete marker and retains **non-current versions**. The bytes are not
  actually gone until those non-current versions (and delete markers) are
  removed. Configure an **S3 lifecycle policy** to expire non-current versions
  and delete markers after your chosen number of days; that lifecycle window,
  not the application purge, governs when versioned copies are finally
  destroyed.
- **Log/audit stores.** Application logs redact content (`lib/logger.ts`), and
  `AuditLog` metadata is non-sensitive by policy, so these are not a document-
  content residual — but they persist per their own retention.

To make "deleted" mean "irrecoverable," you must align three windows:
application `purgeGraceDays`, the **RDS backup retention period**, and the **S3
non-current-version lifecycle**. Data is only truly unrecoverable after the
longest of these has elapsed. Document the effective end-to-end deletion SLA to
tenants as `purgeGraceDays + max(RDS backup window, S3 lifecycle window)`, not
just the grace period.

---

## 8. Compliance note

These mechanisms (immediate embedding removal on soft-delete, grace-window
purge, legal hold, append-only audit, configurable backup windows) are technical
controls that *support* a retention/disposal program. They do not by themselves
establish compliance with CMMC, FedRAMP, NIST 800-171, HIPAA, SOC 2, ITAR, or
CUI handling requirements. Actual compliance depends on your infrastructure
configuration, backup-window settings, organizational policies, contracts,
personnel, and operating procedures. Treat this as a starting point and validate
regulated deployments with the appropriate assessors.
