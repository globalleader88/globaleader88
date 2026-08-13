import Link from 'next/link';
import { loadOrgContext } from '@/server/context';
import { prisma } from '@/lib/db';
import { roleAtLeast } from '@/lib/authz';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { DocumentStatusBadge } from '@/components/status-badge';
import { formatBytes } from '@/lib/utils';

export const dynamic = 'force-dynamic';

export default async function DocumentsPage() {
  const ctx = await loadOrgContext();
  const canUpload = roleAtLeast(ctx.role, 'ANALYST');
  const documents = await prisma.document.findMany({
    where: { organizationId: ctx.organization.id, deletedAt: null },
    orderBy: { createdAt: 'desc' },
    take: 100,
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Documents</h1>
          <p className="text-sm text-muted-foreground">{documents.length} document(s)</p>
        </div>
        {canUpload && (
          <Button asChild>
            <Link href="/documents/upload">Upload</Link>
          </Button>
        )}
      </div>

      <Card>
        <CardContent className="p-0">
          {documents.length === 0 ? (
            <p className="p-6 text-sm text-muted-foreground">No documents yet.</p>
          ) : (
            <table className="w-full text-sm">
              <thead className="border-b bg-muted/40 text-left text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="p-3">Title</th>
                  <th className="p-3">Status</th>
                  <th className="p-3">Size</th>
                  <th className="p-3">Chunks</th>
                  <th className="p-3">Uploaded</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {documents.map((d) => (
                  <tr key={d.id} className="hover:bg-accent/40">
                    <td className="p-3">
                      <Link href={`/documents/${d.id}`} className="font-medium hover:underline">
                        {d.title}
                      </Link>
                    </td>
                    <td className="p-3">
                      <DocumentStatusBadge status={d.status} />
                    </td>
                    <td className="p-3">{formatBytes(d.fileSizeBytes)}</td>
                    <td className="p-3">{d.chunkCount}</td>
                    <td className="p-3 text-muted-foreground">
                      {d.createdAt.toISOString().slice(0, 10)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
