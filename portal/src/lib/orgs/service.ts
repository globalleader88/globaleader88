import { prisma } from '@/lib/db';
import { env } from '@/env';
import type { OrgContext } from '@/lib/authz';
import { roleAtLeast } from '@/lib/authz';
import type { OrgRole } from '@prisma/client';
import { generateToken, sha256Hex } from '@/lib/auth/password';
import { recordAudit, AuditAction } from '@/lib/audit';
import { Errors } from '@/lib/errors';

/**
 * Organization administration: invitations and membership management. All
 * operations are performed in the context of an authenticated org admin and
 * are hard-scoped to that admin's organization.
 */

export interface InvitationResult {
  invitationId: string;
  /** Raw token — returned ONCE so the caller can build the invite link. */
  rawToken: string;
  expiresAt: Date;
}

export async function inviteMember(
  ctx: OrgContext,
  email: string,
  role: OrgRole,
): Promise<InvitationResult> {
  if (!roleAtLeast(ctx.role, 'ADMIN')) throw Errors.forbidden();
  const normalized = email.toLowerCase().trim();

  // Prevent inviting an existing active member.
  const existingMember = await prisma.organizationMembership.findFirst({
    where: { organizationId: ctx.organization.id, user: { email: normalized }, status: 'ACTIVE' },
  });
  if (existingMember) throw Errors.conflict('That user is already a member');

  const rawToken = generateToken(32);
  const tokenHash = sha256Hex(rawToken);
  const expiresAt = new Date(Date.now() + env.INVITATION_EXPIRY_HOURS * 3_600_000);

  // Supersede any prior pending invite for this email.
  await prisma.organizationInvitation.updateMany({
    where: { organizationId: ctx.organization.id, email: normalized, status: 'PENDING' },
    data: { status: 'REVOKED' },
  });

  const invitation = await prisma.organizationInvitation.create({
    data: {
      organizationId: ctx.organization.id,
      email: normalized,
      role,
      tokenHash,
      invitedById: ctx.user.id,
      expiresAt,
    },
  });

  await recordAudit({
    action: AuditAction.INVITATION_SENT,
    organizationId: ctx.organization.id,
    userId: ctx.user.id,
    resourceType: 'invitation',
    resourceId: invitation.id,
    metadata: { role },
  });

  // NOTE: emailing the invite link is a Phase-2 integration seam. For now the
  // raw token is returned to the admin UI to share out of band.
  return { invitationId: invitation.id, rawToken, expiresAt };
}

/** Accept an invitation for the authenticated user (email must match). */
export async function acceptInvitation(userId: string, rawToken: string): Promise<string> {
  const tokenHash = sha256Hex(rawToken);
  const invitation = await prisma.organizationInvitation.findUnique({ where: { tokenHash } });
  if (!invitation || invitation.status !== 'PENDING') {
    throw Errors.validation('This invitation is invalid or has already been used');
  }
  if (invitation.expiresAt < new Date()) {
    await prisma.organizationInvitation.update({
      where: { id: invitation.id },
      data: { status: 'EXPIRED' },
    });
    throw Errors.validation('This invitation has expired');
  }
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user || user.email.toLowerCase() !== invitation.email.toLowerCase()) {
    throw Errors.forbidden('This invitation was issued to a different email address');
  }

  await prisma.$transaction(async (tx) => {
    await tx.organizationMembership.upsert({
      where: {
        organizationId_userId: { organizationId: invitation.organizationId, userId },
      },
      create: {
        organizationId: invitation.organizationId,
        userId,
        role: invitation.role,
        status: 'ACTIVE',
      },
      update: { role: invitation.role, status: 'ACTIVE' },
    });
    await tx.organizationInvitation.update({
      where: { id: invitation.id },
      data: { status: 'ACCEPTED', acceptedAt: new Date() },
    });
  });

  await recordAudit({
    action: AuditAction.INVITATION_ACCEPTED,
    organizationId: invitation.organizationId,
    userId,
    resourceType: 'invitation',
    resourceId: invitation.id,
  });
  return invitation.organizationId;
}

export async function changeMemberRole(
  ctx: OrgContext,
  membershipId: string,
  role: OrgRole,
): Promise<void> {
  if (!roleAtLeast(ctx.role, 'ADMIN')) throw Errors.forbidden();
  const membership = await prisma.organizationMembership.findFirst({
    where: { id: membershipId, organizationId: ctx.organization.id },
  });
  if (!membership) throw Errors.notFound('Member not found');
  // Guard against removing the last admin.
  if (membership.role === 'ADMIN' && role !== 'ADMIN') {
    const adminCount = await prisma.organizationMembership.count({
      where: { organizationId: ctx.organization.id, role: 'ADMIN', status: 'ACTIVE' },
    });
    if (adminCount <= 1) throw Errors.conflict('An organization must keep at least one admin');
  }
  await prisma.organizationMembership.update({ where: { id: membershipId }, data: { role } });
  await recordAudit({
    action: AuditAction.USER_ROLE_CHANGED,
    organizationId: ctx.organization.id,
    userId: ctx.user.id,
    resourceType: 'membership',
    resourceId: membershipId,
    metadata: { role },
  });
}

export async function setMemberStatus(
  ctx: OrgContext,
  membershipId: string,
  status: 'ACTIVE' | 'SUSPENDED',
): Promise<void> {
  if (!roleAtLeast(ctx.role, 'ADMIN')) throw Errors.forbidden();
  const membership = await prisma.organizationMembership.findFirst({
    where: { id: membershipId, organizationId: ctx.organization.id },
  });
  if (!membership) throw Errors.notFound('Member not found');
  if (membership.userId === ctx.user.id) throw Errors.conflict('You cannot suspend yourself');
  await prisma.organizationMembership.update({ where: { id: membershipId }, data: { status } });
  await recordAudit({
    action: AuditAction.USER_SUSPENDED,
    organizationId: ctx.organization.id,
    userId: ctx.user.id,
    resourceType: 'membership',
    resourceId: membershipId,
    metadata: { status },
  });
}
