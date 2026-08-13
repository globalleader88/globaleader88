import { loadSuperAdmin } from '@/server/context';
import { prisma } from '@/lib/db';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { OrgRowActions } from './org-row-actions';

export const dynamic = 'force-dynamic';

export default async function AdminOrganizationsPage() {
  await loadSuperAdmin();
  // Super admins manage org lifecycle across tenants. They see counts and
  // status here — NOT document contents.
  const orgs = await prisma.organization.findMany({
    orderBy: { createdAt: 'desc' },
    include: {
      _count: { select: { memberships: true, documents: true } },
    },
  });

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Organizations</h1>
      <Card>
        <CardContent className="p-0">
          <table className="w-full text-sm">
            <thead className="border-b bg-muted/40 text-left text-xs uppercase text-muted-foreground">
              <tr>
                <th className="p-3">Name</th>
                <th className="p-3">Status</th>
                <th className="p-3">Members</th>
                <th className="p-3">Documents</th>
                <th className="p-3">Created</th>
                <th className="p-3">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {orgs.map((o) => (
                <tr key={o.id}>
                  <td className="p-3 font-medium">{o.name}</td>
                  <td className="p-3">
                    <Badge variant={o.status === 'ACTIVE' ? 'success' : 'destructive'}>
                      {o.status}
                    </Badge>
                  </td>
                  <td className="p-3">{o._count.memberships}</td>
                  <td className="p-3">{o._count.documents}</td>
                  <td className="p-3 text-muted-foreground">
                    {o.createdAt.toISOString().slice(0, 10)}
                  </td>
                  <td className="p-3">
                    <OrgRowActions organizationId={o.id} status={o.status} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}
