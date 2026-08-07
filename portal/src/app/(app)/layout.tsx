import { loadOrgContext } from '@/server/context';
import { AppNav } from '@/components/app-nav';
import { Badge } from '@/components/ui/badge';

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const ctx = await loadOrgContext();
  const suspended = ctx.organization.status === 'SUSPENDED';
  return (
    <div className="flex min-h-screen">
      <AppNav
        organizationName={ctx.organization.name}
        role={ctx.role}
        isSuperAdmin={ctx.user.platformRole === 'SUPER_ADMIN'}
      />
      <main className="flex-1 overflow-y-auto">
        {suspended && (
          <div className="bg-destructive/10 px-6 py-3 text-sm text-destructive">
            <Badge variant="destructive" className="mr-2">
              Suspended
            </Badge>
            This organization is suspended. AI features and uploads are disabled. Contact support.
          </div>
        )}
        <div className="mx-auto max-w-6xl p-6">{children}</div>
      </main>
    </div>
  );
}
