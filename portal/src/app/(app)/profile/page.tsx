import { loadAuth } from '@/server/context';
import { prisma } from '@/lib/db';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

export const dynamic = 'force-dynamic';

export default async function ProfilePage() {
  const { user } = await loadAuth();
  const memberships = await prisma.organizationMembership.findMany({
    where: { userId: user.id },
    include: { organization: { select: { name: true, status: true } } },
  });

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Profile</h1>
      <Card>
        <CardHeader>
          <CardTitle>{user.name ?? user.email}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <div className="flex justify-between border-b py-2">
            <span className="text-muted-foreground">Email</span>
            <span>{user.email}</span>
          </div>
          <div className="flex justify-between border-b py-2">
            <span className="text-muted-foreground">Email verified</span>
            <span>{user.emailVerified ? 'Yes' : 'No'}</span>
          </div>
          <div className="flex justify-between border-b py-2">
            <span className="text-muted-foreground">MFA</span>
            <span>{user.mfaEnabled ? 'Enabled' : 'Not enabled'}</span>
          </div>
          <div className="flex justify-between py-2">
            <span className="text-muted-foreground">Platform role</span>
            <span>{user.platformRole}</span>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Organizations</CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="divide-y text-sm">
            {memberships.map((m) => (
              <li key={m.id} className="flex items-center justify-between py-2">
                <span>{m.organization.name}</span>
                <span className="flex items-center gap-2">
                  <Badge variant="secondary">{m.role}</Badge>
                  <Badge variant={m.status === 'ACTIVE' ? 'success' : 'destructive'}>
                    {m.status}
                  </Badge>
                </span>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
