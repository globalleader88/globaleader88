import { randomUUID } from 'node:crypto';
import { prisma } from '@/lib/db';
import { getStorage, sha256Buffer } from '@/lib/storage';
import { getAIProvider } from '@/lib/ai';
import { logger } from '@/lib/logger';
import { recordAudit, AuditAction } from '@/lib/audit';
import { extractText } from './extract';
import { chunkDocument } from './chunk';
import { sniffMatchesMime } from './validation';
import { insertChunkWithEmbedding, deleteChunksForDocument } from '@/lib/rag/vectors';

/**
 * Document processing pipeline. Invoked by the job worker for a single
 * document. Idempotent: re-running clears prior chunks for the current version
 * and rebuilds them, so a retried job converges to the same state.
 *
 * Stages: fetch → verify checksum + sniff → extract → normalize/clean → chunk
 * (with page/section/sheet/row metadata) → embed → store → mark READY →
 * metrics + audit. Failures set status=FAILED with a safe error string.
 */

export interface ProcessResult {
  chunkCount: number;
  pageCount: number | null;
  tokenTotal: number;
}

export async function processDocument(documentId: string): Promise<ProcessResult> {
  const startedAt = Date.now();
  const document = await prisma.document.findUnique({
    where: { id: documentId },
    include: { currentVersion: true },
  });
  if (!document) throw new Error(`Document ${documentId} not found`);
  if (!document.currentVersion) throw new Error(`Document ${documentId} has no version`);
  const version = document.currentVersion;

  await prisma.document.update({
    where: { id: documentId },
    data: { status: 'PROCESSING', processingError: null },
  });
  await recordAudit({
    action: AuditAction.DOCUMENT_PROCESSING_STARTED,
    organizationId: document.organizationId,
    resourceType: 'document',
    resourceId: documentId,
  });

  const storage = getStorage();
  const buffer = await storage.getObject(version.s3Key);

  // Integrity: checksum recorded at upload must match the stored bytes.
  const digest = sha256Buffer(buffer);
  if (version.sha256 && version.sha256 !== digest) {
    throw new Error('Checksum mismatch — stored file does not match upload');
  }
  if (!sniffMatchesMime(buffer, version.mimeType)) {
    throw new Error('File content does not match its declared type');
  }

  const segments = await extractText(version.mimeType, buffer, document.originalFileName);
  const chunks = chunkDocument(segments);
  if (chunks.length === 0) {
    throw new Error('No extractable text found in document');
  }

  const ai = getAIProvider();

  // Rebuild chunks for idempotency.
  await deleteChunksForDocument(document.organizationId, documentId);

  let tokenTotal = 0;
  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i]!;
    const { embedding } = await ai.generateEmbedding(chunk.content);
    await insertChunkWithEmbedding({
      id: randomUUID(),
      organizationId: document.organizationId,
      documentId,
      versionId: version.id,
      chunkIndex: i,
      content: chunk.content,
      tokenCount: chunk.tokenCount,
      page: chunk.page ?? null,
      section: chunk.section ?? null,
      sheet: chunk.sheet ?? null,
      rowRange: chunk.rowRange ?? null,
      embedding,
    });
    tokenTotal += chunk.tokenCount;
  }

  const pageCount = segments.reduce<number | null>((max, s) => {
    if (s.page == null) return max;
    return max == null ? s.page : Math.max(max, s.page);
  }, null);

  await prisma.document.update({
    where: { id: documentId },
    data: {
      status: 'READY',
      chunkCount: chunks.length,
      pageCount: pageCount ?? undefined,
      sha256: digest,
      processingError: null,
    },
  });

  const metrics: ProcessResult = { chunkCount: chunks.length, pageCount, tokenTotal };
  await recordAudit({
    action: AuditAction.DOCUMENT_PROCESSING_COMPLETED,
    organizationId: document.organizationId,
    resourceType: 'document',
    resourceId: documentId,
    metadata: { chunkCount: chunks.length, durationMs: Date.now() - startedAt },
  });
  logger.info('document.processed', {
    organizationId: document.organizationId,
    action: 'document.processed',
    status: 'success',
    resourceId: documentId,
  });
  return metrics;
}

/** Mark a document failed with a safe, user-facing error message. */
export async function markDocumentFailed(documentId: string, message: string): Promise<void> {
  const doc = await prisma.document.findUnique({ where: { id: documentId } });
  if (!doc) return;
  await prisma.document.update({
    where: { id: documentId },
    data: { status: 'FAILED', processingError: message.slice(0, 500) },
  });
  await recordAudit({
    action: AuditAction.DOCUMENT_PROCESSING_FAILED,
    organizationId: doc.organizationId,
    resourceType: 'document',
    resourceId: documentId,
    outcome: 'failure',
    metadata: { error: message.slice(0, 200) },
  });
}
