'use server';

import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { requirePlatformSuperAdmin } from '@/lib/authz';
import { prisma } from '@/lib/db';
import { recordAudit, AuditAction } from '@/lib/audit';
import { getRequestMeta } from '@/lib/request-context';
import { toPublicError } from '@/lib/errors';

/**
 * Platform super-admin actions. Gated by requirePlatformSuperAdmin. These
 * operate ACROSS organizations by design (org lifecycle management), and are
 * the only place cross-org mutation is permitted. Super admins manage org
 * status but do not read document contents here.
 */

export async function setOrganizationStatusAction(
  organizationId: string,
  status: 'ACTIVE' | 'SUSPENDED',
) {
  const ctx = await requirePlatformSuperAdmin();
  const parsed = z
    .object({ organizationId: z.string().uuid(), status: z.enum(['ACTIVE', 'SUSPENDED']) })
    .safeParse({ organizationId, status });
  if (!parsed.success) return { ok: false as const, error: 'Invalid request' };
  try {
    await prisma.organization.update({
      where: { id: parsed.data.organizationId },
      data: { status: parsed.data.status },
    });
    await recordAudit({
      action: status === 'SUSPENDED' ? AuditAction.ORG_SUSPENDED : AuditAction.ORG_UNSUSPENDED,
      organizationId: parsed.data.organizationId,
      userId: ctx.user.id,
      resourceType: 'organization',
      resourceId: parsed.data.organizationId,
      ...getRequestMeta(),
    });
    revalidatePath('/admin/organizations');
    return { ok: true as const };
  } catch (err) {
    return { ok: false as const, error: toPublicError(err).message };
  }
}
