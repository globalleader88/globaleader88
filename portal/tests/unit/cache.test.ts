import { describe, it, expect } from 'vitest';
import { computeCacheKey } from '@/lib/rag/cache';

/**
 * The response-cache key must isolate organizations and correctly fold in the
 * authorized document set, model, prompt version, and normalized question — so
 * a cached answer can never be reused across tenants or across a different
 * document scope. (Lookups additionally filter by organizationId in SQL.)
 */

const base = {
  organizationId: 'org-a',
  documentScope: ['d1', 'd2'],
  modelId: 'model-x',
  promptVersion: 'v1',
  question: 'What is the deadline?',
};

describe('response cache key', () => {
  it('differs across organizations for the same question', () => {
    const a = computeCacheKey(base);
    const b = computeCacheKey({ ...base, organizationId: 'org-b' });
    expect(a).not.toBe(b);
  });

  it('differs across document scopes', () => {
    const a = computeCacheKey(base);
    const b = computeCacheKey({ ...base, documentScope: ['d1'] });
    expect(a).not.toBe(b);
  });

  it('is order-insensitive for the document scope', () => {
    const a = computeCacheKey({ ...base, documentScope: ['d1', 'd2'] });
    const b = computeCacheKey({ ...base, documentScope: ['d2', 'd1'] });
    expect(a).toBe(b);
  });

  it('normalizes question case and whitespace', () => {
    const a = computeCacheKey(base);
    const b = computeCacheKey({ ...base, question: '  what is   THE deadline?  ' });
    expect(a).toBe(b);
  });

  it('differs across model and prompt version', () => {
    expect(computeCacheKey(base)).not.toBe(computeCacheKey({ ...base, modelId: 'model-y' }));
    expect(computeCacheKey(base)).not.toBe(computeCacheKey({ ...base, promptVersion: 'v2' }));
  });

  it('produces a stable hex digest', () => {
    expect(computeCacheKey(base)).toMatch(/^[0-9a-f]{64}$/);
    expect(computeCacheKey(base)).toBe(computeCacheKey(base));
  });
});
