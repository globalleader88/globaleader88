'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import { signOutAction } from '@/server/actions/auth';

export interface NavProps {
  organizationName: string;
  role: string;
  isSuperAdmin: boolean;
}

const NAV = [
  ['/dashboard', 'Dashboard'],
  ['/documents', 'Documents'],
  ['/chat', 'AI Chat'],
  ['/reports', 'Reports'],
  ['/usage', 'Usage'],
  ['/users', 'Users'],
  ['/audit', 'Security & Audit'],
  ['/settings', 'Settings'],
  ['/profile', 'Profile'],
  ['/help', 'Help & Data Handling'],
] as const;

export function AppNav({ organizationName, role, isSuperAdmin }: NavProps) {
  const pathname = usePathname();
  return (
    <aside className="flex w-60 flex-col border-r bg-card">
      <div className="border-b p-4">
        <div className="text-sm font-semibold text-primary">Global Connects</div>
        <div className="mt-1 truncate text-xs text-muted-foreground" title={organizationName}>
          {organizationName}
        </div>
        <div className="mt-1 text-[11px] uppercase tracking-wide text-muted-foreground">{role}</div>
      </div>
      <nav className="flex-1 space-y-1 overflow-y-auto p-2">
        {NAV.map(([href, label]) => (
          <Link
            key={href}
            href={href}
            className={cn(
              'block rounded-md px-3 py-2 text-sm transition-colors',
              pathname === href || pathname.startsWith(href + '/')
                ? 'bg-primary text-primary-foreground'
                : 'hover:bg-accent',
            )}
          >
            {label}
          </Link>
        ))}
        {isSuperAdmin && (
          <Link
            href="/admin"
            className={cn(
              'mt-2 block rounded-md px-3 py-2 text-sm font-medium transition-colors',
              pathname.startsWith('/admin')
                ? 'bg-primary text-primary-foreground'
                : 'bg-secondary hover:bg-accent',
            )}
          >
            Platform Admin
          </Link>
        )}
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
  );
}
