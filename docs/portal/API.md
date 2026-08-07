# API Reference

The portal is a server-rendered Next.js app. Client-facing operations are
exposed as **server actions** (typed functions invoked from React) and a small
number of **route handlers**. Every entry point resolves tenancy server-side via
`src/lib/authz` — no endpoint accepts an `organizationId` from the caller.

Conventions:

- Server actions return a discriminated result `{ ok: true, ... } | { ok: false, error }`
  (except redirect-style auth actions).
- Authorization is enforced inside each action (`requireOrganizationMembership`,
  `requireOrganizationRole`, `requirePlatformSuperAdmin`, `assert*Access`).
- Input is validated with Zod. Errors are mapped to safe messages by
  `src/lib/errors.ts` and never leak internals.

## Authentication — `src/server/actions/auth.ts`

| Action | Input | Auth | Notes |
| --- | --- | --- | --- |
| `signInAction(prev, formData)` | email, password | public (rate-limited) | Delegates to the auth adapter; establishes a sealed session; audits login. Redirects to `/dashboard`. |
| `signUpAction(prev, formData)` | email, password, name? | public | Creates the identity (Cognito in prod / dev user locally). |
| `forgotPasswordAction(prev, formData)` | email | public | Never reveals whether an account exists. |
| `acceptInvitationAction(prev, formData)` | token | authenticated | Joins the org if the signed-in email matches the invite. |
| `signOutAction()` | — | authenticated | Destroys the session; audits logout. |

## Documents — `src/server/actions/documents.ts`

| Action | Min role | Notes |
| --- | --- | --- |
| `initiateUploadAction(input)` | Analyst | Validates type/size, generates the server-owned S3 key, returns a short-lived presigned upload. |
| `finalizeUploadAction(documentId)` | Analyst | Marks the document pending and enqueues processing. |
| `deleteDocumentAction(documentId)` | Admin | Soft-deletes; removes embeddings immediately. Viewers/Analysts are rejected. |
| `getDownloadUrlAction(documentId)` | any member | Returns an org-validated presigned download URL; audits download. |

All document actions run `assertDocumentAccess`, which is org-scoped and returns
`404` for another tenant's document.

## Chat / RAG — `src/server/actions/chat.ts`

| Action | Min role | Notes |
| --- | --- | --- |
| `createConversationAction(documentScope?)` | any member | Validates any scoped document ids belong to the org. |
| `askAction({ conversationId, question })` | any member | Runs the RAG pipeline; persists messages, citations, usage, audit. Suspended orgs are blocked (no `allowSuspended`). |

## Reports — `src/server/actions/reports.ts`

| Action | Min role | Notes |
| --- | --- | --- |
| `generateReportAction({ type, title?, documentScope? })` | Analyst | Grounded, org-scoped Markdown report with citations, model id, date, and evidence disclaimer. |

## Users — `src/server/actions/users.ts`

| Action | Min role | Notes |
| --- | --- | --- |
| `inviteMemberAction({ email, role })` | Admin | Creates a hashed, expiring invitation; returns the one-time raw token. |
| `changeRoleAction(membershipId, role)` | Admin | Guards against removing the last admin. |
| `setMemberStatusAction(membershipId, status)` | Admin | Suspend/reactivate; cannot self-suspend. |

## Settings — `src/server/actions/settings.ts`

| Action | Min role | Notes |
| --- | --- | --- |
| `updateSettingsAction(prev, formData)` | Admin | Cost/retrieval controls (limits, chunk/context/output caps, thresholds, model overrides). |
| `updateRetentionAction(prev, formData)` | Admin | Retention mode, days, purge grace. |

## Platform admin — `src/server/actions/admin.ts`

| Action | Auth | Notes |
| --- | --- | --- |
| `setOrganizationStatusAction(orgId, status)` | Super admin | Suspend/reactivate an organization. The only cross-org mutation surface. |

## Route handlers

| Route | Methods | Auth | Purpose |
| --- | --- | --- | --- |
| `/api/health` | GET | public | Liveness/readiness (DB ping). No sensitive detail. |
| `/api/dev-storage/[key]` | GET, PUT | member (Analyst for PUT) | **Local-dev only** S3 stand-in; org-prefix validated; disabled unless `STORAGE_DRIVER=local`. |

## Adding a real HTTP API (Phase 2)

The `ApiKey` model (hashed keys, scopes, expiry) is in place for a future
machine-to-machine API. New endpoints should reuse the same authz functions and
add a `requireApiScope`-style guard; never bypass `src/lib/authz`.
