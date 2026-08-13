import { randomUUID } from 'node:crypto';
import { prisma } from '@/lib/db';
import type { OrgContext } from '@/lib/authz';
import { getAIProvider } from '@/lib/ai';
import { resolveModelId } from '@/lib/ai/router';
import { recordUsage, assertWithinLimits } from '@/lib/usage/limits';
import { recordAudit, AuditAction } from '@/lib/audit';
import { logger } from '@/lib/logger';
import { searchChunks, type RetrievedChunk } from './vectors';
import { assembleContext, sanitizeQuestion, PROMPT_VERSION } from './prompt';
import { computeCacheKey, lookupCache, storeCache } from './cache';

/**
 * Secure RAG pipeline. Every retrieval is hard-scoped to the caller's
 * organization (searchChunks requires organizationId). Only relevant excerpts
 * — never whole documents — reach the model. Citations are persisted so the UI
 * can link back to authorized sources.
 */

export interface CitationOut {
  index: number;
  documentId: string;
  documentTitle: string;
  page: number | null;
  section: string | null;
  sheet: string | null;
  rowRange: string | null;
  similarity: number;
  excerpt: string;
}

export interface AnswerResult {
  answer: string;
  insufficientEvidence: boolean;
  citations: CitationOut[];
  modelId: string;
  usage: { inputTokens: number; outputTokens: number };
}

interface RagPrep {
  question: string;
  chunks: RetrievedChunk[];
  titles: Map<string, string>;
  system: string;
  usedChunks: RetrievedChunk[];
  modelId: string;
  maxOutputTokens: number;
}

type OrgSettings = Awaited<ReturnType<typeof prisma.organizationSetting.findUnique>>;

interface QueryPlan {
  question: string;
  settings: OrgSettings;
  modelId: string;
  scope: string[];
  cacheKey: string;
}

/** Cheap pre-step: normalize the question and resolve settings, model, and the
 * cache key — everything needed to check the cache before any embedding call. */
async function planQuery(
  ctx: OrgContext,
  rawQuestion: string,
  documentScope: string[],
): Promise<QueryPlan> {
  const question = sanitizeQuestion(rawQuestion);
  const settings = await prisma.organizationSetting.findUnique({
    where: { organizationId: ctx.organization.id },
  });
  const modelId = resolveModelId('standard', settings);
  const cacheKey = computeCacheKey({
    organizationId: ctx.organization.id,
    documentScope,
    modelId,
    promptVersion: PROMPT_VERSION,
    question,
  });
  return { question, settings, modelId, scope: documentScope, cacheKey };
}

async function prepare(ctx: OrgContext, plan: QueryPlan): Promise<RagPrep> {
  const { question, settings, modelId } = plan;
  const maxChunks = settings?.maxRetrievedChunks ?? 8;
  const maxContextTokens = settings?.maxContextTokens ?? 6000;
  const maxOutputTokens = settings?.maxOutputTokens ?? 1024;
  const threshold = settings?.similarityThreshold ?? 0.2;

  const ai = getAIProvider();
  const { embedding, tokens } = await ai.generateEmbedding(question);
  await recordUsage({
    organizationId: ctx.organization.id,
    userId: ctx.user.id,
    kind: 'embedding',
    modelId: 'embedding',
    embeddingTokens: tokens,
  });

  const chunks = await searchChunks({
    organizationId: ctx.organization.id,
    embedding,
    limit: maxChunks,
    threshold,
    documentIds: plan.scope.length > 0 ? plan.scope : undefined,
  });

  const docIds = [...new Set(chunks.map((c) => c.documentId))];
  const docs = await prisma.document.findMany({
    where: { id: { in: docIds }, organizationId: ctx.organization.id },
    select: { id: true, title: true },
  });
  const titles = new Map(docs.map((d) => [d.id, d.title]));

  const { system, usedChunks } = assembleContext({
    chunks,
    documentTitles: titles,
    maxContextTokens,
  });
  return { question, chunks, titles, system, usedChunks, modelId, maxOutputTokens };
}

function buildCitations(prep: RagPrep): CitationOut[] {
  return prep.usedChunks.map((chunk, i) => ({
    index: i + 1,
    documentId: chunk.documentId,
    documentTitle: prep.titles.get(chunk.documentId) ?? 'Document',
    page: chunk.page,
    section: chunk.section,
    sheet: chunk.sheet,
    rowRange: chunk.rowRange,
    similarity: Number(chunk.similarity.toFixed(4)),
    excerpt: chunk.content.slice(0, 500),
  }));
}

async function persist(
  ctx: OrgContext,
  conversationId: string,
  question: string,
  modelId: string,
  answer: string,
  citations: CitationOut[],
  usage: { inputTokens: number; outputTokens: number },
  insufficientEvidence: boolean,
  cached: boolean,
): Promise<void> {
  await prisma.$transaction(async (tx) => {
    await tx.message.create({
      data: {
        organizationId: ctx.organization.id,
        conversationId,
        userId: ctx.user.id,
        role: 'USER',
        content: question,
      },
    });
    const assistant = await tx.message.create({
      data: {
        organizationId: ctx.organization.id,
        conversationId,
        role: 'ASSISTANT',
        content: answer,
        insufficientEvidence,
        modelId,
        inputTokens: usage.inputTokens,
        outputTokens: usage.outputTokens,
      },
    });
    if (citations.length > 0) {
      await tx.citation.createMany({
        data: citations.map((c) => ({
          id: randomUUID(),
          organizationId: ctx.organization.id,
          conversationId,
          messageId: assistant.id,
          documentId: c.documentId,
          chunkId: null,
          excerpt: c.excerpt,
          page: c.page,
          section: c.section,
          sheet: c.sheet,
          rowRange: c.rowRange,
          similarity: c.similarity,
        })),
      });
    }
    await tx.conversation.update({
      where: { id: conversationId },
      data: { updatedAt: new Date() },
    });
  });

  // A cache hit still counts as a query (daily-limit fairness) but has no token
  // cost, so it records zero tokens.
  await recordUsage({
    organizationId: ctx.organization.id,
    userId: ctx.user.id,
    kind: 'chat',
    modelId,
    inputTokens: usage.inputTokens,
    outputTokens: usage.outputTokens,
  });
  await recordAudit({
    action: AuditAction.AI_RESPONSE_GENERATED,
    organizationId: ctx.organization.id,
    userId: ctx.user.id,
    resourceType: 'conversation',
    resourceId: conversationId,
    metadata: {
      promptVersion: PROMPT_VERSION,
      citations: citations.length,
      insufficientEvidence,
      cached,
    },
  });
}

export async function answerQuestion(
  ctx: OrgContext,
  conversationId: string,
  rawQuestion: string,
  documentScope: string[] = [],
): Promise<AnswerResult> {
  await recordAudit({
    action: AuditAction.AI_QUERY_SUBMITTED,
    organizationId: ctx.organization.id,
    userId: ctx.user.id,
    resourceType: 'conversation',
    resourceId: conversationId,
  });

  // Enforce limits first, then plan the query so we can check the cache before
  // spending any embedding/generation tokens.
  await assertWithinLimits(ctx.organization.id, ctx.user.id);
  const plan = await planQuery(ctx, rawQuestion, documentScope);

  const cached = await lookupCache(ctx.organization.id, plan.cacheKey);
  if (cached) {
    await persist(
      ctx,
      conversationId,
      plan.question,
      cached.modelId,
      cached.answer,
      cached.citations,
      { inputTokens: 0, outputTokens: 0 },
      cached.insufficientEvidence,
      true,
    );
    return {
      answer: cached.answer,
      insufficientEvidence: cached.insufficientEvidence,
      citations: cached.citations,
      modelId: cached.modelId,
      usage: { inputTokens: 0, outputTokens: 0 },
    };
  }

  const prep = await prepare(ctx, plan);
  const ai = getAIProvider();
  const result = await ai.generateText({
    system: prep.system,
    messages: [{ role: 'user', content: prep.question }],
    modelId: prep.modelId,
    maxOutputTokens: prep.maxOutputTokens,
  });

  const insufficientEvidence =
    prep.usedChunks.length === 0 ||
    /do not contain enough information|does not contain enough information/i.test(result.text);
  const citations = insufficientEvidence ? [] : buildCitations(prep);

  await persist(
    ctx,
    conversationId,
    prep.question,
    prep.modelId,
    result.text,
    citations,
    { inputTokens: result.inputTokens, outputTokens: result.outputTokens },
    insufficientEvidence,
    false,
  );
  await storeCache({
    organizationId: ctx.organization.id,
    cacheKey: plan.cacheKey,
    modelId: prep.modelId,
    promptVersion: PROMPT_VERSION,
    answer: result.text,
    citations,
    insufficientEvidence,
  });

  logger.info('ai.answer', {
    organizationId: ctx.organization.id,
    action: 'ai.answer',
    status: 'success',
    resourceId: conversationId,
  });

  return {
    answer: result.text,
    insufficientEvidence,
    citations,
    modelId: prep.modelId,
    usage: { inputTokens: result.inputTokens, outputTokens: result.outputTokens },
  };
}

const INSUFFICIENT_MESSAGE =
  'The available documents do not contain enough information to answer this question.';

export interface StreamFinal {
  insufficientEvidence: boolean;
  citations: CitationOut[];
  modelId: string;
  usage: { inputTokens: number; outputTokens: number };
}

/**
 * Streaming variant of {@link answerQuestion}. Yields answer text deltas as the
 * model produces them and returns the final citations/usage. Persistence (the
 * message, citations, usage, and audit record) happens once the stream
 * completes — identical to the non-streaming path — so a streamed answer is
 * saved exactly like a blocking one. Same tenant scoping and cost controls:
 * usage limits are enforced and the org-isolated cache is checked before any
 * token is emitted; on a cache hit the stored answer is streamed back with no
 * model call.
 */
export async function* streamAnswer(
  ctx: OrgContext,
  conversationId: string,
  rawQuestion: string,
  documentScope: string[] = [],
): AsyncGenerator<string, StreamFinal, void> {
  await recordAudit({
    action: AuditAction.AI_QUERY_SUBMITTED,
    organizationId: ctx.organization.id,
    userId: ctx.user.id,
    resourceType: 'conversation',
    resourceId: conversationId,
  });

  await assertWithinLimits(ctx.organization.id, ctx.user.id);
  const plan = await planQuery(ctx, rawQuestion, documentScope);

  // Cache hit: stream the stored answer word-by-word, no model call.
  const hit = await lookupCache(ctx.organization.id, plan.cacheKey);
  if (hit) {
    const words = hit.answer.split(' ');
    for (let i = 0; i < words.length; i++) {
      yield i === 0 ? words[i]! : ` ${words[i]}`;
    }
    await persist(
      ctx,
      conversationId,
      plan.question,
      hit.modelId,
      hit.answer,
      hit.citations,
      { inputTokens: 0, outputTokens: 0 },
      hit.insufficientEvidence,
      true,
    );
    return {
      insufficientEvidence: hit.insufficientEvidence,
      citations: hit.citations,
      modelId: hit.modelId,
      usage: { inputTokens: 0, outputTokens: 0 },
    };
  }

  const prep = await prepare(ctx, plan);
  let full = '';
  let usage = { inputTokens: 0, outputTokens: 0 };

  if (prep.usedChunks.length === 0) {
    // No relevant evidence: stream the fixed insufficient-evidence message
    // rather than calling the model at all.
    for (const word of INSUFFICIENT_MESSAGE.split(' ')) {
      full += full ? ` ${word}` : word;
      yield full === word ? word : ` ${word}`;
    }
  } else {
    const ai = getAIProvider();
    const gen = ai.streamText({
      system: prep.system,
      messages: [{ role: 'user', content: prep.question }],
      modelId: prep.modelId,
      maxOutputTokens: prep.maxOutputTokens,
    });
    let next = await gen.next();
    while (!next.done) {
      full += next.value;
      yield next.value;
      next = await gen.next();
    }
    usage = { inputTokens: next.value.inputTokens, outputTokens: next.value.outputTokens };
  }

  const insufficientEvidence =
    prep.usedChunks.length === 0 ||
    /do not contain enough information|does not contain enough information/i.test(full);
  const citations = insufficientEvidence ? [] : buildCitations(prep);

  await persist(
    ctx,
    conversationId,
    prep.question,
    prep.modelId,
    full,
    citations,
    usage,
    insufficientEvidence,
    false,
  );
  await storeCache({
    organizationId: ctx.organization.id,
    cacheKey: plan.cacheKey,
    modelId: prep.modelId,
    promptVersion: PROMPT_VERSION,
    answer: full,
    citations,
    insufficientEvidence,
  });

  logger.info('ai.answer.stream', {
    organizationId: ctx.organization.id,
    action: 'ai.answer',
    status: 'success',
    resourceId: conversationId,
  });

  return { insufficientEvidence, citations, modelId: prep.modelId, usage };
}
