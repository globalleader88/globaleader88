import { loadSuperAdmin } from '@/server/context';
import { prisma } from '@/lib/db';
import { Card, CardContent } from '@/components/ui/card';

export const dynamic = 'force-dynamic';

const SECURITY_ACTIONS = [
  'auth.login_failed',
  'auth.login',
  'auth.logout',
  'platform.org_suspended',
  'platform.org_unsuspended',
  'org.user_suspended',
  'org.user_role_changed',
  'org.invitation_sent',
];

export default async function AdminSecurityPage() {
  await loadSuperAdmin();
  // Platform-wide security-relevant events. Metadata only — never doc content.
  const events = await prisma.auditLog.findMany({
    where: { action: { in: SECURITY_ACTIONS } },
    orderBy: { createdAt: 'desc' },
    take: 200,
    include: { user: { select: { email: true } }, organization: { select: { name: true } } },
  });

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Security Events</h1>
      <Card>
        <CardContent className="p-0">
          <table className="w-full text-sm">
            <thead className="border-b bg-muted/40 text-left text-xs uppercase text-muted-foreground">
              <tr>
                <th className="p-3">Time</th>
                <th className="p-3">Action</th>
                <th className="p-3">Org</th>
                <th className="p-3">Actor</th>
                <th className="p-3">Outcome</th>
                <th className="p-3">IP</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {events.map((e) => (
                <tr key={e.id}>
                  <td className="p-3 text-muted-foreground">
                    {e.createdAt.toISOString().slice(0, 19).replace('T', ' ')}
                  </td>
                  <td className="p-3 font-mono text-xs">{e.action}</td>
                  <td className="p-3">{e.organization?.name ?? '—'}</td>
                  <td className="p-3">{e.user?.email ?? '—'}</td>
                  <td className="p-3">{e.outcome}</td>
                  <td className="p-3 text-xs text-muted-foreground">{e.ipAddress ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}
