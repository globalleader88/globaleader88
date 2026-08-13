import { randomUUID } from 'node:crypto';
import { prisma } from '@/lib/db';
import type { OrgContext } from '@/lib/authz';
import { getStorage } from '@/lib/storage';
import { buildDocumentKey } from '@/lib/storage/keys';
import { validateUpload } from './validation';
import { enqueueJob } from '@/lib/jobs/queue';
import { recordAudit, AuditAction } from '@/lib/audit';
import { env } from '@/env';
import type { PresignedUpload } from '@/lib/storage';

/**
 * Secure upload initiation. The server owns every security decision here:
 * permission, file-type/size validation, and — critically — the S3 object key.
 * The browser receives a short-lived presigned URL scoped to that exact key and
 * content type; it can neither choose the path nor reach another org's prefix.
 */

export interface InitiateUploadInput {
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  title?: string;
  classification?: 'PUBLIC' | 'INTERNAL' | 'CONFIDENTIAL' | 'RESTRICTED';
  sha256?: string;
}

export interface InitiateUploadResult {
  documentId: string;
  versionId: string;
  upload: PresignedUpload;
}

export async function initiateUpload(
  ctx: OrgContext,
  input: InitiateUploadInput,
): Promise<InitiateUploadResult> {
  const validated = validateUpload(input);

  const documentId = randomUUID();
  const versionId = randomUUID();
  const key = buildDocumentKey({
    organizationId: ctx.organization.id,
    documentId,
    versionId,
    fileName: input.fileName,
  });

  await prisma.$transaction(async (tx) => {
    await tx.document.create({
      data: {
        id: documentId,
        organizationId: ctx.organization.id,
        title: input.title?.trim() || input.fileName,
        originalFileName: input.fileName,
        mimeType: validated.mime,
        fileSizeBytes: BigInt(input.sizeBytes),
        sha256: input.sha256,
        classification: input.classification ?? 'CONFIDENTIAL',
        status: 'UPLOADING',
        uploadedById: ctx.user.id,
      },
    });
    await tx.documentVersion.create({
      data: {
        id: versionId,
        organizationId: ctx.organization.id,
        documentId,
        versionNumber: 1,
        s3Key: key,
        s3Bucket: env.AWS_S3_BUCKET,
        fileSizeBytes: BigInt(input.sizeBytes),
        sha256: input.sha256,
        mimeType: validated.mime,
      },
    });
    await tx.document.update({
      where: { id: documentId },
      data: { currentVersionId: versionId },
    });
  });

  const upload = await getStorage().presignUpload(key, validated.mime);

  await recordAudit({
    action: AuditAction.DOCUMENT_UPLOADED,
    organizationId: ctx.organization.id,
    userId: ctx.user.id,
    resourceType: 'document',
    resourceId: documentId,
    metadata: { mime: validated.mime, sizeBytes: input.sizeBytes },
  });

  return { documentId, versionId, upload };
}

/**
 * Finalize an upload: mark the document PENDING and enqueue processing. Called
 * after the browser confirms the presigned PUT succeeded. Verifies the document
 * belongs to the caller's org.
 */
export async function finalizeUpload(ctx: OrgContext, documentId: string): Promise<void> {
  const doc = await prisma.document.findFirst({
    where: { id: documentId, organizationId: ctx.organization.id, status: 'UPLOADING' },
  });
  if (!doc) return;
  await prisma.document.update({
    where: { id: documentId },
    data: { status: 'PENDING' },
  });
  await enqueueJob({
    organizationId: ctx.organization.id,
    type: 'DOCUMENT_PROCESSING',
    documentId,
  });
}
