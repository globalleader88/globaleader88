# Cost Controls — Client Intelligence Portal

The portal calls Amazon Bedrock for both chat/report generation and embeddings,
stores document bytes in S3, and runs on RDS Postgres. This document explains
the cost model and the application-level controls the codebase actually
implements to keep spend bounded and predictable per tenant.

---

## 1. Cost model

Where the money goes, roughly in order of typical variability:

- **Bedrock generation tokens.** Every chat answer and generated report sends a
  token-budgeted context plus the system/user prompt and receives output tokens.
  Input and output tokens are billed at different per-1k rates per model. This
  is the largest and most user-driven cost.
- **Bedrock embedding tokens.** Each uploaded document is chunked (~700 tokens
  per chunk, ~100 overlap) and every chunk is embedded once with Amazon Titan.
  Each **query** is also embedded once for retrieval. Embeddings are far cheaper
  per token than generation but scale with corpus size and query volume.
- **S3 storage.** Original document bytes, encrypted with SSE-KMS, plus any
  non-current object versions retained by versioning/lifecycle. Generally small
  relative to Bedrock, but grows with retention windows.
- **RDS Postgres.** Instance hours, storage, IOPS, automated-backup storage, and
  PITR. The pgvector index and `DocumentChunk` rows are the main data-size
  drivers.
- **Supporting services.** KMS requests, CloudWatch logs, data transfer. Minor
  but non-zero.

Indicative per-1k-token prices used by the in-app estimator
(`src/lib/ai/pricing.ts`) — for budgeting/warnings, **not billing**:

| Model | Input / 1k | Output / 1k |
|---|---|---|
| Claude 3 Haiku (`anthropic.claude-3-haiku-20240307-v1:0`) | $0.00025 | $0.00125 |
| Claude 3.5 Sonnet (`anthropic.claude-3-5-sonnet-20240620-v1:0`) | $0.003 | $0.015 |
| Claude 3 Opus (`anthropic.claude-3-opus-20240229-v1:0`) | $0.015 | $0.075 |
| Titan Embed v2 (`amazon.titan-embed-text-v2:0`) | $0.00002 | $0 |

Unknown model ids fall back to the Sonnet rate. Keep these values in sync with
the current Bedrock pricing page; they exist to power warnings and dashboards,
not to invoice customers.

---

## 2. Controls that are actually implemented

All per-organization controls live on the **`OrganizationSetting`** row
(`prisma/schema.prisma`); usage is recorded in **`UsageRecord`**. Enforcement is
in `src/lib/usage/limits.ts` and the retrieval/answer pipeline.

### 2.1 Per-org monthly token limit (hard stop)

- Field: `OrganizationSetting.monthlyTokenLimit` (BigInt, default `5,000,000`;
  seeded from `DEFAULT_MONTHLY_TOKEN_LIMIT`).
- `getUsageStatus()` sums `inputTokens + outputTokens + embeddingTokens` from
  `UsageRecord` for the current UTC month. `assertWithinLimits()` throws a usage
  error once the sum reaches the limit. It is called **before** any billable AI
  call, so an over-budget org is blocked, not merely warned.

### 2.2 Per-user daily query limit (hard stop)

- Field: `OrganizationSetting.dailyQueryLimitPerUser` (default `200`; seeded from
  `DEFAULT_DAILY_QUERY_LIMIT`).
- Counts the user's `UsageRecord` rows with `kind='chat'` for the current UTC
  day; over the limit, `assertWithinLimits()` throws "Daily query limit
  reached." This caps a single user's ability to run up cost.

### 2.3 Retrieval and context caps (per request)

- `maxRetrievedChunks` (default `8`) — upper bound on chunks pulled from vector
  search, bounding retrieved context size.
- `maxContextTokens` (default `6000`) — token budget for assembled context; the
  prompt assembler stops adding chunks at this budget.
- `maxOutputTokens` (default `1024`) — caps generation length, which caps the
  most expensive (output) tokens per request.
- `similarityThreshold` (default `0.2`) — filters weak matches so the model
  isn't fed (and charged for) irrelevant context.

### 2.4 Model routing by task class

`src/lib/ai/router.ts` maps a task class to a concrete model, preferring
per-org overrides and falling back to env:

- `low` → `lowCostModelId` / `AWS_BEDROCK_LOW_COST_MODEL_ID` (Haiku by default):
  classification, metadata extraction, simple Q&A, summaries.
- `standard` → `standardModelId` / `AWS_BEDROCK_CHAT_MODEL_ID` (Sonnet):
  detailed analysis, report generation, multi-doc synthesis.
- `advanced` → `advancedModelId` / `AWS_BEDROCK_ADVANCED_MODEL_ID`: complex
  reasoning and compliance-style review.

Report types are pre-mapped (`taskClassForReport`) — e.g. summaries and action
items route to `low`; risk/compliance/comparison route to `advanced`. Routing
cheaper work to Haiku is the single biggest per-request cost lever.

### 2.5 Warn threshold + hard stop

- `warnThresholdPercent` (default `80`). `getUsageStatus()` returns `warn=true`
  once monthly token usage crosses this percentage, so the UI/alerts can surface
  an approaching limit **before** the hard stop at 100% (§2.1) blocks calls.

### 2.6 Usage records in micro-USD

- `recordUsage()` writes a `UsageRecord` with token counts and
  `estimatedCostMicroUsd` (integer micro-USD, `1e-6` USD) computed by
  `estimateCostMicroUsd()`. Integer micro-USD avoids floating-point drift when
  summing across many requests. Records carry `organizationId`, optional
  `userId`, `kind` (`chat`/`embedding`/`report`/`classification`), `modelId`,
  and `requestId`.

### 2.7 Admin override

- Limits are adjusted by editing `OrganizationSetting` (e.g. raising
  `monthlyTokenLimit` for a specific org). Per `limits.ts`, override is a
  **platform super-admin** capability via the admin API and is **not exposed to
  org users** — tenants cannot lift their own caps.

---

## 3. Response / summary caching (documented pattern, extension point)

Caching identical answers or report summaries can cut Bedrock spend
significantly, but in a multi-tenant RAG system a naive cache is a
**data-leak risk**. This is a documented pattern and extension point; if you add
a cache, the key **must** include all of:

- **Organization id** — never share a cache entry across organizations, ever.
- **The authorized document set** — the exact set of document ids the user is
  permitted to retrieve from (or the conversation's `documentScope`). Two users
  in the same org with different document access must not share an entry.
- **Model id** — different models produce different answers and costs.
- **Prompt version** — the pipeline exposes a `PROMPT_VERSION`; a prompt change
  must invalidate stale entries.
- The **normalized query / report inputs**.

Rules of thumb: cache only fully-grounded, non-personalized responses; scope
every entry to a single org; invalidate on document change, soft-delete, or
re-embedding; and never let a cache lookup bypass the authorization checks in
`lib/authz`. When in doubt, do not cache — correctness and isolation outrank the
savings.

---

## 4. Monthly usage reporting and dashboards

`UsageRecord` is the reporting substrate. It is indexed by
`(organizationId, createdAt)` and `(organizationId, userId, createdAt)`, so:

- **Per-org monthly rollups**: sum `inputTokens/outputTokens/embeddingTokens`
  and `estimatedCostMicroUsd` grouped by month → tokens and estimated USD per
  tenant. This mirrors what `getUsageStatus()` computes for enforcement.
- **Per-user activity**: chat volume and cost per user per day/month.
- **By kind and model**: split spend across `chat`, `embedding`, `report`,
  `classification`, and by `modelId`, to see where budget goes and whether
  routing is working.
- **Platform view**: a super-admin can aggregate across orgs for platform-level
  cost and to spot outliers.

Convert stored micro-USD to dollars with `microUsdToUsd()` (or divide by
`1_000_000`) for display. Surface the warn threshold prominently so tenants act
before the hard stop.

---

## 5. Tuning recommendations

- **Right-size the models.** Ensure genuinely simple tasks route to `low`
  (Haiku). Haiku input is ~12× cheaper and output ~12× cheaper than Sonnet in
  the estimator table — most of the savings live here.
- **Trim context.** Lower `maxRetrievedChunks` and `maxContextTokens` for orgs
  whose questions are answerable from a few chunks; raise `similarityThreshold`
  to drop weak matches. Both cut input tokens per request.
- **Cap output.** Keep `maxOutputTokens` as low as the use case tolerates;
  output tokens are the most expensive.
- **Set realistic budgets.** Tune `monthlyTokenLimit` and
  `dailyQueryLimitPerUser` per contract, and set `warnThresholdPercent` low
  enough to give tenants time to react.
- **Control corpus growth.** Embedding and storage cost scale with document
  volume; retention/purge (`DATA_RETENTION.md`) keeps dead weight out of both S3
  and the vector table.
- **Watch the fallback price.** Any model id not in the price table is estimated
  at the Sonnet rate — add new models to `pricing.ts` so estimates stay honest.

---

## 6. Per-request cost estimation formula

The estimator computes, in USD:

```
cost = (inputTokens  / 1000) * inputPer1k(model)
     + (outputTokens / 1000) * outputPer1k(model)
```

then rounds to integer **micro-USD** (`round(usd * 1_000_000)`) for storage.

A useful *pre-flight* upper bound for a single chat request, before the call:

```
maxInputTokens  ≈ promptOverhead + min(maxContextTokens, retrievedChunkTokens)
maxOutputTokens =  OrganizationSetting.maxOutputTokens
estMaxCost      ≈ (maxInputTokens/1000)*inputPer1k + (maxOutputTokens/1000)*outputPer1k
                +  queryEmbeddingTokens/1000 * 0.00002   // Titan query embed
```

For an **upload**, the one-time embedding cost is roughly:

```
docEmbedCost ≈ (totalDocumentTokens / 1000) * 0.00002   // Titan, output rate 0
```

These formulas use the same rates as `pricing.ts`; keep both in sync when prices
change. Because generation dominates, the two biggest levers remain **which
model** the task routes to and **how many output tokens** it is allowed to
produce.

## Response caching — implementation status

Response caching is **implemented** and org-isolated (`src/lib/rag/cache.ts`,
`response_cache` table). The cache key hashes organization + authorized document
set + model + prompt version + normalized question, and every lookup **also**
filters by `organizationId`, so a confidential answer is never served across
tenants. Cache hits skip both embedding and generation (no Bedrock cost) while
still counting as one query for per-user daily-limit fairness (recorded with
zero tokens). Entries are invalidated when the org's documents or retrieval/model
settings change, with a TTL backstop. Configure via `RESPONSE_CACHE_ENABLED` and
`RESPONSE_CACHE_TTL_SECONDS`.
