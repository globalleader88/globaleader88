import { prisma } from '@/lib/db';
import { getStorage } from '@/lib/storage';
import { recordAudit, AuditAction } from '@/lib/audit';
import { logger } from '@/lib/logger';

/**
 * Retention + deletion. Two phases:
 *   1. Soft delete: documents past their retention date (and not on legal hold)
 *      get `deletedAt` set and are excluded from retrieval immediately.
 *   2. Purge: soft-deleted documents older than the org's purge grace window
 *      have their S3 objects, versions, and chunks permanently removed.
 *
 * Backups are out of scope for immediate deletion — see
 * docs/portal/DATA_RETENTION.md for how backup expiration actually works.
 */

export interface RetentionSweepResult extends Record<string, unknown> {
  softDeleted: number;
  purged: number;
}

export async function runRetentionSweep(): Promise<RetentionSweepResult> {
  const now = new Date();
  let softDeleted = 0;
  let purged = 0;

  // Phase 1: honour per-document retention dates.
  const expiring = await prisma.document.findMany({
    where: { deletedAt: null, legalHold: false, retentionDate: { not: null, lte: now } },
    select: { id: true, organizationId: true },
  });
  for (const doc of expiring) {
    await softDeleteDocument(doc.organizationId, doc.id, { reason: 'retention' });
    softDeleted++;
  }

  // Phase 2: purge documents past the grace window.
  const policies = await prisma.retentionPolicy.findMany();
  const graceByOrg = new Map(policies.map((p) => [p.organizationId, p.purgeGraceDays]));
  const candidates = await prisma.document.findMany({
    where: { deletedAt: { not: null }, legalHold: false },
    include: { versions: true },
  });
  for (const doc of candidates) {
    const grace = graceByOrg.get(doc.organizationId) ?? 7;
    const purgeAfter = new Date((doc.deletedAt as Date).getTime() + grace * 86_400_000);
    if (purgeAfter > now) continue;
    await purgeDocument(doc.organizationId, doc.id);
    purged++;
  }

  logger.info('retention.sweep', {
    action: 'retention.sweep',
    status: 'success',
    softDeleted,
    purged,
  });
  return { softDeleted, purged };
}

export async function softDeleteDocument(
  organizationId: string,
  documentId: string,
  opts: { reason?: string; userId?: string } = {},
): Promise<void> {
  await prisma.document.updateMany({
    where: { id: documentId, organizationId, deletedAt: null },
    data: { deletedAt: new Date(), status: 'DELETED' },
  });
  // Embeddings are removed immediately so deleted docs cannot be retrieved.
  await prisma.documentChunk.deleteMany({ where: { organizationId, documentId } });
  await recordAudit({
    action: AuditAction.DOCUMENT_DELETED,
    organizationId,
    userId: opts.userId,
    resourceType: 'document',
    resourceId: documentId,
    metadata: { reason: opts.reason ?? 'manual' },
  });
}

/** Permanently remove a document's bytes and rows. */
export async function purgeDocument(organizationId: string, documentId: string): Promise<void> {
  const versions = await prisma.documentVersion.findMany({
    where: { documentId, organizationId },
  });
  const storage = getStorage();
  for (const v of versions) {
    try {
      await storage.deleteObject(v.s3Key);
    } catch {
      logger.warn('retention.purge_object_failed', {
        organizationId,
        action: 'retention.purge',
        status: 'error',
        resourceId: documentId,
      });
    }
  }
  // Cascades remove versions and chunks.
  await prisma.document.deleteMany({ where: { id: documentId, organizationId } });
}
