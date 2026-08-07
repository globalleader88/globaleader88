import { createHash } from 'node:crypto';
import { prisma } from '@/lib/db';
import { env } from '@/env';
import { logger } from '@/lib/logger';
import type { CitationOut } from './answer';

/**
 * Org-isolated response cache.
 *
 * SAFETY: a cached answer is only ever served to the same organization. The
 * cache key is a hash of (organizationId + authorized document set + model +
 * prompt version + normalized question), AND every lookup additionally filters
 * by organizationId — so even a hypothetical key collision cannot cross a
 * tenant boundary. Confidential answers are therefore never shared between
 * organizations.
 *
 * Freshness: entries are invalidated whenever the org's documents change
 * (processing completes, deletion) or its retrieval/model settings change, with
 * a TTL as a backstop. See invalidateOrgCache().
 */

export interface CacheKeyInput {
  organizationId: string;
  documentScope: string[];
  modelId: string;
  promptVersion: string;
  question: string;
}

export function computeCacheKey(input: CacheKeyInput): string {
  // Sort scope so the same document set in any order maps to one key. Normalize
  // the question (case/space-insensitive) so trivially different phrasings of
  // the identical question share a cache slot.
  const scope = [...input.documentScope].sort();
  const normalizedQuestion = input.question.toLowerCase().replace(/\s+/g, ' ').trim();
  const material = JSON.stringify({
    org: input.organizationId,
    scope,
    model: input.modelId,
    prompt: input.promptVersion,
    q: normalizedQuestion,
  });
  return createHash('sha256').update(material).digest('hex');
}

export interface CachedAnswer {
  answer: string;
  citations: CitationOut[];
  insufficientEvidence: boolean;
  modelId: string;
}

export async function lookupCache(
  organizationId: string,
  cacheKey: string,
): Promise<CachedAnswer | null> {
  if (!env.RESPONSE_CACHE_ENABLED) return null;
  try {
    // organizationId is part of the WHERE clause (defence in depth), not just
    // baked into the key.
    const row = await prisma.responseCache.findFirst({
      where: { cacheKey, organizationId, expiresAt: { gt: new Date() } },
    });
    if (!row) return null;
    // Best-effort hit accounting; never block the response on it.
    prisma.responseCache
      .update({
        where: { id: row.id },
        data: { hitCount: { increment: 1 }, lastAccessedAt: new Date() },
      })
      .catch(() => undefined);
    return {
      answer: row.answer,
      citations: (row.citations as unknown as CitationOut[]) ?? [],
      insufficientEvidence: row.insufficientEvidence,
      modelId: row.modelId,
    };
  } catch {
    logger.warn('cache.lookup_failed', { action: 'cache.lookup', status: 'error' });
    return null;
  }
}

export async function storeCache(params: {
  organizationId: string;
  cacheKey: string;
  modelId: string;
  promptVersion: string;
  answer: string;
  citations: CitationOut[];
  insufficientEvidence: boolean;
}): Promise<void> {
  if (!env.RESPONSE_CACHE_ENABLED) return;
  const expiresAt = new Date(Date.now() + env.RESPONSE_CACHE_TTL_SECONDS * 1000);
  try {
    await prisma.responseCache.upsert({
      where: { cacheKey: params.cacheKey },
      create: {
        organizationId: params.organizationId,
        cacheKey: params.cacheKey,
        modelId: params.modelId,
        promptVersion: params.promptVersion,
        answer: params.answer,
        citations: params.citations as unknown as object,
        insufficientEvidence: params.insufficientEvidence,
        expiresAt,
      },
      update: {
        answer: params.answer,
        citations: params.citations as unknown as object,
        insufficientEvidence: params.insufficientEvidence,
        modelId: params.modelId,
        promptVersion: params.promptVersion,
        expiresAt,
      },
    });
  } catch {
    // A cache write failure must never break answering.
    logger.warn('cache.store_failed', {
      organizationId: params.organizationId,
      action: 'cache.store',
      status: 'error',
    });
  }
}

/**
 * Drop all cached answers for an organization. Called when its documents or
 * retrieval settings change, so a stale answer is never served.
 */
export async function invalidateOrgCache(organizationId: string): Promise<void> {
  if (!env.RESPONSE_CACHE_ENABLED) return;
  try {
    await prisma.responseCache.deleteMany({ where: { organizationId } });
  } catch {
    logger.warn('cache.invalidate_failed', {
      organizationId,
      action: 'cache.invalidate',
      status: 'error',
    });
  }
}

/** Delete expired rows. Call from a scheduled sweep. */
export async function purgeExpiredCache(): Promise<number> {
  const res = await prisma.responseCache.deleteMany({ where: { expiresAt: { lt: new Date() } } });
  return res.count;
}
