'use server';

import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { requireOrganizationMembership } from '@/lib/authz';
import { inviteMember, changeMemberRole, setMemberStatus } from '@/lib/orgs/service';
import { toPublicError } from '@/lib/errors';

const roleEnum = z.enum(['ADMIN', 'ANALYST', 'VIEWER']);

export async function inviteMemberAction(input: {
  email: string;
  role: 'ADMIN' | 'ANALYST' | 'VIEWER';
}) {
  const ctx = await requireOrganizationMembership({ minRole: 'ADMIN' });
  const parsed = z.object({ email: z.string().email(), role: roleEnum }).safeParse(input);
  if (!parsed.success) return { ok: false as const, error: 'Enter a valid email and role' };
  try {
    const result = await inviteMember(ctx, parsed.data.email, parsed.data.role);
    revalidatePath('/users');
    // The raw token is returned once so the admin can share the invite link.
    return {
      ok: true as const,
      rawToken: result.rawToken,
      expiresAt: result.expiresAt.toISOString(),
    };
  } catch (err) {
    return { ok: false as const, error: toPublicError(err).message };
  }
}

export async function changeRoleAction(membershipId: string, role: 'ADMIN' | 'ANALYST' | 'VIEWER') {
  const ctx = await requireOrganizationMembership({ minRole: 'ADMIN' });
  const parsed = z
    .object({ membershipId: z.string().uuid(), role: roleEnum })
    .safeParse({ membershipId, role });
  if (!parsed.success) return { ok: false as const, error: 'Invalid request' };
  try {
    await changeMemberRole(ctx, parsed.data.membershipId, parsed.data.role);
    revalidatePath('/users');
    return { ok: true as const };
  } catch (err) {
    return { ok: false as const, error: toPublicError(err).message };
  }
}

export async function setMemberStatusAction(membershipId: string, status: 'ACTIVE' | 'SUSPENDED') {
  const ctx = await requireOrganizationMembership({ minRole: 'ADMIN' });
  const parsed = z
    .object({ membershipId: z.string().uuid(), status: z.enum(['ACTIVE', 'SUSPENDED']) })
    .safeParse({ membershipId, status });
  if (!parsed.success) return { ok: false as const, error: 'Invalid request' };
  try {
    await setMemberStatus(ctx, parsed.data.membershipId, parsed.data.status);
    revalidatePath('/users');
    return { ok: true as const };
  } catch (err) {
    return { ok: false as const, error: toPublicError(err).message };
  }
}
