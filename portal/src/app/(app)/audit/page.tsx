import { redirect } from 'next/navigation';
import { loadOrgContext } from '@/server/context';
import { roleAtLeast } from '@/lib/authz';
import { prisma } from '@/lib/db';
import { Card, CardContent } from '@/components/ui/card';

export const dynamic = 'force-dynamic';

export default async function AuditPage() {
  const ctx = await loadOrgContext();
  // Audit visibility is an admin capability.
  if (!roleAtLeast(ctx.role, 'ADMIN')) redirect('/dashboard');

  const events = await prisma.auditLog.findMany({
    where: { organizationId: ctx.organization.id },
    orderBy: { createdAt: 'desc' },
    take: 200,
    include: { user: { select: { email: true } } },
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Security &amp; Audit</h1>
        <p className="text-sm text-muted-foreground">
          Append-only record of security-relevant actions for {ctx.organization.name}.
        </p>
      </div>
      <Card>
        <CardContent className="p-0">
          <table className="w-full text-sm">
            <thead className="border-b bg-muted/40 text-left text-xs uppercase text-muted-foreground">
              <tr>
                <th className="p-3">Time</th>
                <th className="p-3">Action</th>
                <th className="p-3">Actor</th>
                <th className="p-3">Resource</th>
                <th className="p-3">Outcome</th>
                <th className="p-3">IP</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {events.map((e) => (
                <tr key={e.id}>
                  <td className="p-3 text-muted-foreground">
                    {e.createdAt.toISOString().replace('T', ' ').slice(0, 19)}
                  </td>
                  <td className="p-3 font-mono text-xs">{e.action}</td>
                  <td className="p-3">{e.user?.email ?? '—'}</td>
                  <td className="p-3 text-xs">
                    {e.resourceType
                      ? `${e.resourceType}${e.resourceId ? `:${e.resourceId.slice(0, 8)}` : ''}`
                      : '—'}
                  </td>
                  <td className="p-3">{e.outcome}</td>
                  <td className="p-3 text-xs text-muted-foreground">{e.ipAddress ?? '—'}</td>
                </tr>
              ))}
              {events.length === 0 && (
                <tr>
                  <td className="p-3 text-muted-foreground" colSpan={6}>
                    No audit events yet.
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
