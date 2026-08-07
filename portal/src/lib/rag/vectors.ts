import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/db';
import { env } from '@/env';
import { Errors } from '@/lib/errors';

/**
 * pgvector access. Prisma cannot bind the `vector` column type directly, so
 * embeddings are read/written with parameterized raw SQL. Every query here
 * REQUIRES an organizationId and always filters on it, so a vector search can
 * never cross tenants even if a caller forgets a higher-level check.
 */

function toVectorLiteral(embedding: number[]): string {
  if (embedding.length !== env.AWS_BEDROCK_EMBEDDING_DIMENSION) {
    throw Errors.internal(
      `Embedding dimension ${embedding.length} != ${env.AWS_BEDROCK_EMBEDDING_DIMENSION}`,
    );
  }
  // pgvector text format: "[0.1,0.2,...]". Values are numbers we produced, so
  // this is not user-controlled string interpolation.
  return `[${embedding.map((n) => (Number.isFinite(n) ? n : 0)).join(',')}]`;
}

export interface StoredChunkInput {
  id: string;
  organizationId: string;
  documentId: string;
  versionId: string;
  chunkIndex: number;
  content: string;
  tokenCount: number;
  page?: number | null;
  section?: string | null;
  sheet?: string | null;
  rowRange?: string | null;
  embedding: number[];
}

/** Insert a chunk row with its embedding. Idempotent on (doc, version, index). */
export async function insertChunkWithEmbedding(input: StoredChunkInput): Promise<void> {
  const vec = toVectorLiteral(input.embedding);
  await prisma.$executeRaw`
    INSERT INTO document_chunks
      (id, "organizationId", "documentId", "versionId", "chunkIndex", content,
       "tokenCount", page, section, sheet, "rowRange", embedding, "createdAt")
    VALUES
      (${input.id}::uuid, ${input.organizationId}::uuid, ${input.documentId}::uuid,
       ${input.versionId}::uuid, ${input.chunkIndex}, ${input.content},
       ${input.tokenCount}, ${input.page ?? null}, ${input.section ?? null},
       ${input.sheet ?? null}, ${input.rowRange ?? null}, ${vec}::vector, now())
    ON CONFLICT ("documentId", "versionId", "chunkIndex") DO NOTHING
  `;
}

export interface RetrievedChunk {
  id: string;
  documentId: string;
  content: string;
  page: number | null;
  section: string | null;
  sheet: string | null;
  rowRange: string | null;
  similarity: number;
}

/**
 * Org-scoped nearest-neighbour search. Filters:
 *   - organizationId (hard tenant boundary)
 *   - the document is not soft-deleted and is READY
 *   - optional documentIds subset
 *   - similarity >= threshold (cosine)
 */
export async function searchChunks(params: {
  organizationId: string;
  embedding: number[];
  limit: number;
  threshold: number;
  documentIds?: string[];
}): Promise<RetrievedChunk[]> {
  const vec = toVectorLiteral(params.embedding);
  const docFilter =
    params.documentIds && params.documentIds.length > 0
      ? Prisma.sql`AND c."documentId" = ANY(${params.documentIds}::uuid[])`
      : Prisma.empty;

  const rows = await prisma.$queryRaw<
    Array<{
      id: string;
      documentId: string;
      content: string;
      page: number | null;
      section: string | null;
      sheet: string | null;
      rowRange: string | null;
      similarity: number;
    }>
  >(Prisma.sql`
    SELECT c.id,
           c."documentId",
           c.content,
           c.page,
           c.section,
           c.sheet,
           c."rowRange",
           1 - (c.embedding <=> ${vec}::vector) AS similarity
    FROM document_chunks c
    JOIN documents d ON d.id = c."documentId"
    WHERE c."organizationId" = ${params.organizationId}::uuid
      AND d."deletedAt" IS NULL
      AND d.status = 'READY'
      ${docFilter}
    ORDER BY c.embedding <=> ${vec}::vector ASC
    LIMIT ${params.limit}
  `);

  return rows.filter((r) => r.similarity >= params.threshold);
}

export async function deleteChunksForDocument(
  organizationId: string,
  documentId: string,
): Promise<void> {
  await prisma.documentChunk.deleteMany({ where: { organizationId, documentId } });
}
