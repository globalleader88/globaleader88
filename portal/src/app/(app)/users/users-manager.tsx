'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  inviteMemberAction,
  changeRoleAction,
  setMemberStatusAction,
} from '@/server/actions/users';

type Role = 'ADMIN' | 'ANALYST' | 'VIEWER';

export interface MemberRow {
  membershipId: string;
  email: string;
  name: string | null;
  role: Role;
  status: 'ACTIVE' | 'SUSPENDED';
  isSelf: boolean;
}

export function UsersManager({ members, canManage }: { members: MemberRow[]; canManage: boolean }) {
  const router = useRouter();
  const [inviteLink, setInviteLink] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function invite(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const email = (form.elements.namedItem('email') as HTMLInputElement).value;
    const role = (form.elements.namedItem('role') as HTMLSelectElement).value as Role;
    setBusy(true);
    setError(null);
    const res = await inviteMemberAction({ email, role });
    setBusy(false);
    if (res.ok) {
      const url = `${window.location.origin}/accept-invitation?token=${res.rawToken}`;
      setInviteLink(url);
      form.reset();
      router.refresh();
    } else {
      setError(res.error);
    }
  }

  async function updateRole(membershipId: string, role: Role) {
    const res = await changeRoleAction(membershipId, role);
    if (!res.ok) setError(res.error);
    router.refresh();
  }

  async function toggleStatus(membershipId: string, status: 'ACTIVE' | 'SUSPENDED') {
    const res = await setMemberStatusAction(membershipId, status);
    if (!res.ok) setError(res.error);
    router.refresh();
  }

  return (
    <div className="space-y-6">
      {canManage && (
        <form onSubmit={invite} className="flex flex-wrap items-end gap-3 rounded-lg border p-4">
          <div className="space-y-1">
            <label className="text-sm font-medium">Invite by email</label>
            <Input
              name="email"
              type="email"
              placeholder="colleague@example.com"
              required
              className="w-64"
            />
          </div>
          <select
            name="role"
            defaultValue="VIEWER"
            className="h-10 rounded-md border border-input bg-background px-3 text-sm"
          >
            <option value="ADMIN">Admin</option>
            <option value="ANALYST">Analyst</option>
            <option value="VIEWER">Viewer</option>
          </select>
          <Button type="submit" disabled={busy}>
            Send invitation
          </Button>
        </form>
      )}

      {inviteLink && (
        <div className="rounded-md border border-emerald-500/40 bg-emerald-500/10 p-3 text-sm">
          <p className="font-medium">Invitation created. Share this one-time link:</p>
          <code className="mt-1 block break-all text-xs">{inviteLink}</code>
        </div>
      )}
      {error && <p className="text-sm text-destructive">{error}</p>}

      <div className="overflow-hidden rounded-lg border">
        <table className="w-full text-sm">
          <thead className="border-b bg-muted/40 text-left text-xs uppercase text-muted-foreground">
            <tr>
              <th className="p-3">User</th>
              <th className="p-3">Role</th>
              <th className="p-3">Status</th>
              {canManage && <th className="p-3">Actions</th>}
            </tr>
          </thead>
          <tbody className="divide-y">
            {members.map((m) => (
              <tr key={m.membershipId}>
                <td className="p-3">
                  <div className="font-medium">{m.name ?? m.email}</div>
                  <div className="text-xs text-muted-foreground">{m.email}</div>
                </td>
                <td className="p-3">
                  {canManage && !m.isSelf ? (
                    <select
                      defaultValue={m.role}
                      onChange={(e) => updateRole(m.membershipId, e.target.value as Role)}
                      className="h-8 rounded border border-input bg-background px-2 text-xs"
                    >
                      <option value="ADMIN">Admin</option>
                      <option value="ANALYST">Analyst</option>
                      <option value="VIEWER">Viewer</option>
                    </select>
                  ) : (
                    <Badge variant="secondary">{m.role}</Badge>
                  )}
                </td>
                <td className="p-3">
                  <Badge variant={m.status === 'ACTIVE' ? 'success' : 'destructive'}>
                    {m.status}
                  </Badge>
                </td>
                {canManage && (
                  <td className="p-3">
                    {!m.isSelf && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() =>
                          toggleStatus(
                            m.membershipId,
                            m.status === 'ACTIVE' ? 'SUSPENDED' : 'ACTIVE',
                          )
                        }
                      >
                        {m.status === 'ACTIVE' ? 'Suspend' : 'Reactivate'}
                      </Button>
                    )}
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
