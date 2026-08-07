import { loadOrgContext } from '@/server/context';
import { roleAtLeast } from '@/lib/authz';
import { prisma } from '@/lib/db';
import { UsersManager, type MemberRow } from './users-manager';

export const dynamic = 'force-dynamic';

export default async function UsersPage() {
  const ctx = await loadOrgContext();
  const canManage = roleAtLeast(ctx.role, 'ADMIN');

  const memberships = await prisma.organizationMembership.findMany({
    where: { organizationId: ctx.organization.id },
    include: { user: { select: { email: true, name: true } } },
    orderBy: { createdAt: 'asc' },
  });

  const members: MemberRow[] = memberships.map((m) => ({
    membershipId: m.id,
    email: m.user.email,
    name: m.user.name,
    role: m.role,
    status: m.status,
    isSelf: m.userId === ctx.user.id,
  }));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">User management</h1>
        <p className="text-sm text-muted-foreground">
          {canManage ? 'Invite members and manage roles.' : 'Members of your organization.'}
        </p>
      </div>
      <UsersManager members={members} canManage={canManage} />
    </div>
  );
}
