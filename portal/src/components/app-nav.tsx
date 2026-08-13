'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import { signOutAction } from '@/server/actions/auth';
import { BrandMark } from '@/components/brand-mark';

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
        <BrandMark size="sm" />
        <div className="mt-3 truncate text-xs font-medium text-foreground" title={organizationName}>
          {organizationName}
        </div>
        <div className="mt-1 flex items-center gap-2 text-[11px] uppercase tracking-wide text-muted-foreground">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 glow-dot text-emerald-400" />
          {role}
        </div>
      </div>
      <nav className="flex-1 space-y-1 overflow-y-auto p-2">
        {NAV.map(([href, label]) => (
          <Link
            key={href}
            href={href}
            className={cn(
              'relative block rounded-md px-3 py-2 text-sm transition-colors',
              pathname === href || pathname.startsWith(href + '/')
                ? 'bg-primary/15 text-foreground shadow-[inset_0_0_0_1px_hsl(var(--primary)/0.35)] before:absolute before:inset-y-2 before:-left-2 before:w-0.5 before:rounded-full before:bg-primary before:shadow-[0_0_10px_hsl(var(--primary))]'
                : 'text-muted-foreground hover:bg-accent hover:text-foreground',
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
