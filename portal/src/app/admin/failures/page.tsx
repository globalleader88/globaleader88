import { loadSuperAdmin } from '@/server/context';
import { prisma } from '@/lib/db';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

export const dynamic = 'force-dynamic';

export default async function AdminFailuresPage() {
  await loadSuperAdmin();
  const jobs = await prisma.processingJob.findMany({
    where: { status: { in: ['FAILED', 'RETRYING'] } },
    orderBy: { updatedAt: 'desc' },
    take: 200,
    include: { organization: { select: { name: true } } },
  });

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Processing Failures</h1>
      <Card>
        <CardContent className="p-0">
          <table className="w-full text-sm">
            <thead className="border-b bg-muted/40 text-left text-xs uppercase text-muted-foreground">
              <tr>
                <th className="p-3">Time</th>
                <th className="p-3">Org</th>
                <th className="p-3">Type</th>
                <th className="p-3">Status</th>
                <th className="p-3">Attempts</th>
                <th className="p-3">Error</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {jobs.map((j) => (
                <tr key={j.id}>
                  <td className="p-3 text-muted-foreground">
                    {j.updatedAt.toISOString().slice(0, 19).replace('T', ' ')}
                  </td>
                  <td className="p-3">{j.organization.name}</td>
                  <td className="p-3 text-xs">{j.type}</td>
                  <td className="p-3">
                    <Badge variant={j.status === 'FAILED' ? 'destructive' : 'warning'}>
                      {j.status}
                    </Badge>
                  </td>
                  <td className="p-3">
                    {j.attempts}/{j.maxAttempts}
                  </td>
                  <td
                    className="p-3 max-w-xs truncate text-xs text-muted-foreground"
                    title={j.lastError ?? ''}
                  >
                    {j.lastError ?? '—'}
                  </td>
                </tr>
              ))}
              {jobs.length === 0 && (
                <tr>
                  <td className="p-3 text-muted-foreground" colSpan={6}>
                    No failing jobs.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}
