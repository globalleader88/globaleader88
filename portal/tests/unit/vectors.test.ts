import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Verifies that org-scoped vector search always constrains by organizationId
 * (and joins to non-deleted, READY documents), so a retrieval can never surface
 * another tenant's chunks — even if a higher-level check were forgotten.
 */

const queryRaw = vi.fn().mockResolvedValue([]);
vi.mock('@/lib/db', () => ({ prisma: { $queryRaw: (...a: unknown[]) => queryRaw(...a) } }));

import { searchChunks } from '@/lib/rag/vectors';
import { env } from '@/env';

const ORG = '11111111-1111-1111-1111-111111111111';

function embedding(): number[] {
  return new Array(env.AWS_BEDROCK_EMBEDDING_DIMENSION).fill(0.01);
}

function sqlText(arg: unknown): string {
  // Prisma.Sql exposes `sql`/`text`; fall back to stringifying.
  const s = arg as { sql?: string; text?: string; strings?: string[] };
  return s.sql ?? s.text ?? (s.strings ? s.strings.join(' ') : String(arg));
}

beforeEach(() => queryRaw.mockClear());

describe('searchChunks tenancy', () => {
  it('filters by organizationId, deletedAt IS NULL and status READY', async () => {
    await searchChunks({ organizationId: ORG, embedding: embedding(), limit: 5, threshold: 0.2 });
    expect(queryRaw).toHaveBeenCalledTimes(1);
    const text = sqlText(queryRaw.mock.calls[0]?.[0]);
    expect(text).toMatch(/"organizationId" =/);
    expect(text).toMatch(/d\."deletedAt" IS NULL/);
    expect(text).toMatch(/d\.status = 'READY'/);
  });

  it('rejects an embedding of the wrong dimension', async () => {
    await expect(
      searchChunks({ organizationId: ORG, embedding: [0.1, 0.2], limit: 5, threshold: 0.2 }),
    ).rejects.toBeTruthy();
  });

  it('applies the similarity threshold client-side', async () => {
    queryRaw.mockResolvedValueOnce([
      {
        id: 'a',
        documentId: 'd',
        content: 'x',
        page: null,
        section: null,
        sheet: null,
        rowRange: null,
        similarity: 0.9,
      },
      {
        id: 'b',
        documentId: 'd',
        content: 'y',
        page: null,
        section: null,
        sheet: null,
        rowRange: null,
        similarity: 0.1,
      },
    ]);
    const rows = await searchChunks({
      organizationId: ORG,
      embedding: embedding(),
      limit: 5,
      threshold: 0.5,
    });
    expect(rows.map((r) => r.id)).toEqual(['a']);
  });
});
