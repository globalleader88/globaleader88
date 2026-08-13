import Link from 'next/link';
import { loadAuth } from '@/server/context';
import { getAuthorizedOrganization } from '@/lib/authz';
import { getSession } from '@/lib/auth/session';
import { redirect } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { signOutAction } from '@/server/actions/auth';

export const dynamic = 'force-dynamic';

/**
 * Shown to an authenticated user who has no active organization membership.
 * Lives OUTSIDE the (app) route group so it does not trigger the org-required
 * redirect that the app layout enforces.
 */
export default async function NoOrganizationPage() {
  const { user } = await loadAuth();
  const session = await getSession();
  // If a membership now exists, send them into the app.
  const resolved = await getAuthorizedOrganization(user.id, session);
  if (resolved) redirect('/dashboard');

  return (
    <main className="flex min-h-screen items-center justify-center bg-secondary/40 px-4">
      <Card className="w-full max-w-lg">
        <CardHeader>
          <CardTitle>No organization yet</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 text-sm text-muted-foreground">
          <p>
            You&apos;re signed in as <strong>{user.email}</strong>, but you&apos;re not a member of
            any organization. Ask an administrator to invite you, then accept the invitation.
          </p>
          <div className="flex gap-2">
            <Button asChild variant="outline">
              <Link href="/accept-invitation">Accept an invitation</Link>
            </Button>
            <form action={signOutAction}>
              <Button type="submit" variant="ghost">
                Sign out
              </Button>
            </form>
          </div>
        </CardContent>
      </Card>
    </main>
  );
}
