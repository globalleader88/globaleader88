import Link from 'next/link';
import { loadOrgContext } from '@/server/context';
import { prisma } from '@/lib/db';
import { roleAtLeast } from '@/lib/authz';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ReportGenerator } from '@/components/report-generator';

export const dynamic = 'force-dynamic';

export default async function ReportsPage() {
  const ctx = await loadOrgContext();
  const reports = await prisma.generatedReport.findMany({
    where: { organizationId: ctx.organization.id, deletedAt: null },
    orderBy: { createdAt: 'desc' },
    take: 50,
  });

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Reports</h1>

      {roleAtLeast(ctx.role, 'ANALYST') && (
        <Card>
          <CardHeader>
            <CardTitle>Generate a report</CardTitle>
          </CardHeader>
          <CardContent>
            <ReportGenerator />
            <p className="mt-3 text-xs text-muted-foreground">
              Reports are grounded in your organization&apos;s documents, include citations and an
              evidence disclaimer, and record the model used.
            </p>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardContent className="p-0">
          {reports.length === 0 ? (
            <p className="p-6 text-sm text-muted-foreground">No reports yet.</p>
          ) : (
            <ul className="divide-y">
              {reports.map((r) => (
                <li key={r.id}>
                  <Link
                    href={`/reports/${r.id}`}
                    className="flex items-center justify-between p-4 hover:bg-accent/40"
                  >
                    <span className="font-medium">{r.title}</span>
                    <span className="flex items-center gap-3 text-xs text-muted-foreground">
                      <Badge
                        variant={
                          r.status === 'COMPLETED'
                            ? 'success'
                            : r.status === 'FAILED'
                              ? 'destructive'
                              : 'warning'
                        }
                      >
                        {r.status}
                      </Badge>
                      {r.createdAt.toISOString().slice(0, 10)}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
