'use server';

import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { requireOrganizationMembership, assertDocumentAccess } from '@/lib/authz';
import { initiateUpload, finalizeUpload } from '@/lib/documents/upload';
import { softDeleteDocument } from '@/lib/retention';
import { presignOrgDownload } from '@/lib/storage';
import { prisma } from '@/lib/db';
import { recordAudit, AuditAction } from '@/lib/audit';
import { toPublicError } from '@/lib/errors';

/**
 * Document server actions. Every one starts from requireOrganizationMembership,
 * which resolves the tenant server-side, and uses assertDocumentAccess for
 * per-document operations. The browser only ever passes a documentId; it can
 * never reach another org's document because the lookups are org-scoped.
 */

const initiateSchema = z.object({
  fileName: z.string().min(1).max(255),
  mimeType: z.string().min(1),
  sizeBytes: z.number().int().positive(),
  title: z.string().max(255).optional(),
  classification: z.enum(['PUBLIC', 'INTERNAL', 'CONFIDENTIAL', 'RESTRICTED']).optional(),
  sha256: z
    .string()
    .regex(/^[0-9a-f]{64}$/i)
    .optional(),
});

export type InitiateInput = z.infer<typeof initiateSchema>;

export async function initiateUploadAction(input: InitiateInput) {
  // Analyst+ may upload (viewers cannot).
  const ctx = await requireOrganizationMembership({ minRole: 'ANALYST' });
  const parsed = initiateSchema.safeParse(input);
  if (!parsed.success) return { ok: false as const, error: 'Invalid upload request' };
  try {
    const result = await initiateUpload(ctx, parsed.data);
    return { ok: true as const, ...result };
  } catch (err) {
    return { ok: false as const, error: toPublicError(err).message };
  }
}

export async function finalizeUploadAction(documentId: string) {
  const ctx = await requireOrganizationMembership({ minRole: 'ANALYST' });
  try {
    await assertDocumentAccess(ctx, documentId, { includeDeleted: true });
    await finalizeUpload(ctx, documentId);
    revalidatePath('/documents');
    return { ok: true as const };
  } catch (err) {
    return { ok: false as const, error: toPublicError(err).message };
  }
}

export async function deleteDocumentAction(documentId: string) {
  // Only admins may delete (viewers/analysts cannot).
  const ctx = await requireOrganizationMembership({ minRole: 'ADMIN' });
  try {
    await assertDocumentAccess(ctx, documentId);
    await softDeleteDocument(ctx.organization.id, documentId, { userId: ctx.user.id });
    revalidatePath('/documents');
    return { ok: true as const };
  } catch (err) {
    return { ok: false as const, error: toPublicError(err).message };
  }
}

export async function getDownloadUrlAction(documentId: string) {
  const ctx = await requireOrganizationMembership();
  try {
    const doc = await assertDocumentAccess(ctx, documentId);
    const version = await prisma.documentVersion.findFirst({
      where: { documentId, organizationId: ctx.organization.id },
      orderBy: { versionNumber: 'desc' },
    });
    if (!version) return { ok: false as const, error: 'No file available' };
    const url = await presignOrgDownload(ctx.organization.id, version.s3Key, doc.originalFileName);
    await recordAudit({
      action: AuditAction.DOCUMENT_DOWNLOADED,
      organizationId: ctx.organization.id,
      userId: ctx.user.id,
      resourceType: 'document',
      resourceId: documentId,
    });
    return { ok: true as const, url };
  } catch (err) {
    return { ok: false as const, error: toPublicError(err).message };
  }
}
