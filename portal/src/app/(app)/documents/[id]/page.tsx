import { notFound } from 'next/navigation';
import { loadOrgContext } from '@/server/context';
import { assertDocumentAccess, roleAtLeast } from '@/lib/authz';
import { prisma } from '@/lib/db';
import { AppError } from '@/lib/errors';
import { recordAudit, AuditAction } from '@/lib/audit';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { DocumentStatusBadge } from '@/components/status-badge';
import { DocumentActions } from '@/components/document-actions';
import { formatBytes } from '@/lib/utils';

export const dynamic = 'force-dynamic';

export default async function DocumentDetailPage({ params }: { params: { id: string } }) {
  const ctx = await loadOrgContext();
  let doc;
  try {
    doc = await assertDocumentAccess(ctx, params.id);
  } catch (err) {
    if (err instanceof AppError && err.code === 'NOT_FOUND') notFound();
    throw err;
  }
  await recordAudit({
    action: AuditAction.DOCUMENT_VIEWED,
    organizationId: ctx.organization.id,
    userId: ctx.user.id,
    resourceType: 'document',
    resourceId: doc.id,
  });

  const chunkCount = await prisma.documentChunk.count({
    where: { organizationId: ctx.organization.id, documentId: doc.id },
  });

  const rows: Array<[string, string]> = [
    ['Status', doc.status],
    ['Classification', doc.classification],
    ['Original file', doc.originalFileName],
    ['MIME type', doc.mimeType],
    ['Size', formatBytes(doc.fileSizeBytes)],
    ['Pages', doc.pageCount ? String(doc.pageCount) : '—'],
    ['Chunks', String(chunkCount)],
    ['SHA-256', doc.sha256 ? `${doc.sha256.slice(0, 16)}…` : '—'],
    ['Uploaded', doc.createdAt.toISOString().slice(0, 19).replace('T', ' ')],
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-semibold">{doc.title}</h1>
          <div className="mt-2">
            <DocumentStatusBadge status={doc.status} />
          </div>
        </div>
        <DocumentActions documentId={doc.id} canDelete={roleAtLeast(ctx.role, 'ADMIN')} />
      </div>

      {doc.status === 'FAILED' && doc.processingError && (
        <Card>
          <CardHeader>
            <CardTitle className="text-destructive">Processing error</CardTitle>
          </CardHeader>
          <CardContent className="text-sm">{doc.processingError}</CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Details</CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="grid grid-cols-1 gap-2 text-sm sm:grid-cols-2">
            {rows.map(([k, v]) => (
              <div
                key={k}
                className="flex justify-between border-b py-2 sm:block sm:border-0 sm:py-0"
              >
                <dt className="text-muted-foreground">{k}</dt>
                <dd className="font-medium">{v}</dd>
              </div>
            ))}
          </dl>
        </CardContent>
      </Card>
    </div>
  );
}
