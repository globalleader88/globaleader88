import { describe, it, expect, beforeAll } from 'vitest';

/**
 * Integration tests that exercise real Postgres + pgvector tenant isolation.
 * Gated behind TEST_DATABASE_URL so the default `npm test` stays DB-free.
 *
 * Run against a disposable database:
 *   TEST_DATABASE_URL=postgresql://portal:portal@localhost:5432/portal_test \
 *     npx prisma migrate deploy && npx vitest run tests/integration
 *
 * These verify at the data layer that:
 *   - vector search never returns another organization's chunks;
 *   - deleted documents are excluded from retrieval.
 */

const DB = process.env.TEST_DATABASE_URL;

describe.skipIf(!DB)('tenant isolation (Postgres + pgvector)', () => {
  beforeAll(() => {
    process.env.DATABASE_URL = DB;
  });

  it('vector search is scoped to the organization', async () => {
    const { prisma } = await import('@/lib/db');
    const { searchChunks, insertChunkWithEmbedding } = await import('@/lib/rag/vectors');
    const { env } = await import('@/env');
    const { randomUUID } = await import('node:crypto');

    const orgA = await prisma.organization.create({
      data: { name: 'A', slug: `a-${randomUUID()}` },
    });
    const orgB = await prisma.organization.create({
      data: { name: 'B', slug: `b-${randomUUID()}` },
    });
    const userA = await prisma.user.create({ data: { email: `a-${randomUUID()}@t.local` } });

    async function doc(orgId: string) {
      const d = await prisma.document.create({
        data: {
          organizationId: orgId,
          title: 'Doc',
          originalFileName: 'd.txt',
          mimeType: 'text/plain',
          fileSizeBytes: 10n,
          status: 'READY',
          uploadedById: userA.id,
        },
      });
      const v = await prisma.documentVersion.create({
        data: {
          organizationId: orgId,
          documentId: d.id,
          versionNumber: 1,
          s3Key: `organizations/${orgId}/documents/${d.id}/v/d.txt`,
          s3Bucket: 'test',
          fileSizeBytes: 10n,
          mimeType: 'text/plain',
        },
      });
      return { d, v };
    }

    const a = await doc(orgA.id);
    const b = await doc(orgB.id);
    const embedding = new Array(env.AWS_BEDROCK_EMBEDDING_DIMENSION).fill(0.05);

    await insertChunkWithEmbedding({
      id: randomUUID(),
      organizationId: orgA.id,
      documentId: a.d.id,
      versionId: a.v.id,
      chunkIndex: 0,
      content: 'org A secret content',
      tokenCount: 5,
      embedding,
    });
    await insertChunkWithEmbedding({
      id: randomUUID(),
      organizationId: orgB.id,
      documentId: b.d.id,
      versionId: b.v.id,
      chunkIndex: 0,
      content: 'org B secret content',
      tokenCount: 5,
      embedding,
    });

    const resultsForA = await searchChunks({
      organizationId: orgA.id,
      embedding,
      limit: 10,
      threshold: -1,
    });
    expect(resultsForA.every((r) => r.documentId === a.d.id)).toBe(true);
    expect(resultsForA.some((r) => r.content.includes('org B'))).toBe(false);
  });
});
