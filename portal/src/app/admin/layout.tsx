import Link from 'next/link';
import { loadSuperAdmin } from '@/server/context';
import { signOutAction } from '@/server/actions/auth';

const ADMIN_NAV = [
  ['/admin/organizations', 'Organizations'],
  ['/admin/usage', 'Platform Usage'],
  ['/admin/security', 'Security Events'],
  ['/admin/failures', 'Processing Failures'],
  ['/admin/health', 'System Health'],
] as const;

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  await loadSuperAdmin();
  return (
    <div className="flex min-h-screen">
      <aside className="flex w-60 flex-col border-r bg-card">
        <div className="border-b p-4">
          <div className="text-sm font-semibold text-primary">Platform Admin</div>
          <Link
            href="/dashboard"
            className="mt-1 block text-xs text-muted-foreground hover:underline"
          >
            ← Back to app
          </Link>
        </div>
        <nav className="flex-1 space-y-1 p-2">
          {ADMIN_NAV.map(([href, label]) => (
            <Link
              key={href}
              href={href}
              className="block rounded-md px-3 py-2 text-sm hover:bg-accent"
            >
              {label}
            </Link>
          ))}
        </nav>
        <form action={signOutAction} className="border-t p-2">
          <button
            className="w-full rounded-md px-3 py-2 text-left text-sm hover:bg-accent"
            type="submit"
          >
            Sign out
          </button>
        </form>
      </aside>
      <main className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-6xl p-6">{children}</div>
      </main>
    </div>
  );
}
