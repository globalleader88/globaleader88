import 'server-only';
import type {
  User,
  Organization,
  OrganizationMembership,
  OrgRole,
  Document,
  Conversation,
} from '@prisma/client';
import { prisma } from '@/lib/db';
import { getSession, type SessionData } from '@/lib/auth/session';
import { Errors } from '@/lib/errors';

/**
 * Authorization primitives. Every server action, route handler, and worker
 * that touches client-owned data MUST start here.
 *
 * Rule zero: the browser never supplies `organizationId`. The active
 * organization is derived from (authenticated user) × (live membership) ×
 * (session hint), and re-validated on every call. A tampered session cookie is
 * cryptographically rejected (see auth/session); a valid cookie pointing at an
 * org the user no longer belongs to is rejected here.
 */

export interface AuthContext {
  user: User;
  session: SessionData;
}

export interface OrgContext extends AuthContext {
  organization: Organization;
  membership: OrganizationMembership;
  role: OrgRole;
}

const ROLE_RANK: Record<OrgRole, number> = { VIEWER: 1, ANALYST: 2, ADMIN: 3 };

export function roleAtLeast(role: OrgRole, min: OrgRole): boolean {
  return ROLE_RANK[role] >= ROLE_RANK[min];
}

/** Authenticated + active user, or throw. */
export async function requireAuthenticatedUser(): Promise<AuthContext> {
  const session = await getSession();
  if (!session) throw Errors.unauthenticated();
  const user = await prisma.user.findFirst({
    where: { id: session.userId, deletedAt: null },
  });
  if (!user) throw Errors.unauthenticated();
  if (user.status === 'SUSPENDED') {
    throw Errors.forbidden('Your account has been suspended');
  }
  return { user, session };
}

export async function requirePlatformSuperAdmin(): Promise<AuthContext> {
  const ctx = await requireAuthenticatedUser();
  if (ctx.user.platformRole !== 'SUPER_ADMIN') {
    throw Errors.forbidden('Platform administrator access required');
  }
  return ctx;
}

/**
 * Resolve the authorized organization for a user, server-side only.
 * Preference order: the session's active-org hint (if the user still has an
 * active membership there) → the user's most recent active membership.
 * Returns null if the user has no active membership anywhere.
 */
export async function getAuthorizedOrganization(
  userId: string,
  session: SessionData | null,
): Promise<{ organization: Organization; membership: OrganizationMembership } | null> {
  const hint = session?.activeOrganizationId;
  if (hint) {
    const membership = await prisma.organizationMembership.findFirst({
      where: { userId, organizationId: hint, status: 'ACTIVE' },
      include: { organization: true },
    });
    if (membership && membership.organization.deletedAt === null) {
      const { organization, ...m } = membership;
      return { organization, membership: m };
    }
  }
  const fallback = await prisma.organizationMembership.findFirst({
    where: { userId, status: 'ACTIVE', organization: { deletedAt: null } },
    include: { organization: true },
    orderBy: { updatedAt: 'desc' },
  });
  if (!fallback) return null;
  const { organization, ...m } = fallback;
  return { organization, membership: m };
}

interface OrgRequirement {
  /** Minimum role required. Defaults to VIEWER. */
  minRole?: OrgRole;
  /** Allow access even when the organization is suspended (default false). */
  allowSuspended?: boolean;
}

/**
 * The workhorse: authenticated user + resolved org + active membership + role
 * gate. Blocks suspended organizations by default (AI, upload, and mutation
 * paths rely on this), and blocks suspended memberships always.
 */
export async function requireOrganizationMembership(req: OrgRequirement = {}): Promise<OrgContext> {
  const { user, session } = await requireAuthenticatedUser();
  const resolved = await getAuthorizedOrganization(user.id, session);
  if (!resolved) throw Errors.forbidden('You are not a member of any organization');

  const { organization, membership } = resolved;
  if (membership.status !== 'ACTIVE') {
    throw Errors.forbidden('Your membership in this organization is suspended');
  }
  if (organization.status === 'SUSPENDED' && !req.allowSuspended) {
    throw Errors.forbidden('This organization is suspended');
  }
  if (req.minRole && !roleAtLeast(membership.role, req.minRole)) {
    throw Errors.forbidden('You do not have permission to perform this action');
  }
  return { user, session, organization, membership, role: membership.role };
}

/** Convenience wrapper mirroring the requested API name. */
export function requireOrganizationRole(minRole: OrgRole): Promise<OrgContext> {
  return requireOrganizationMembership({ minRole });
}

/**
 * Load a document only if it belongs to the caller's authorized organization
 * and is not soft-deleted. Any mismatch is a 404 (not 403) so we never confirm
 * the existence of another tenant's resource.
 */
export async function assertDocumentAccess(
  ctx: OrgContext,
  documentId: string,
  opts: { includeDeleted?: boolean } = {},
): Promise<Document> {
  const doc = await prisma.document.findFirst({
    where: {
      id: documentId,
      organizationId: ctx.organization.id,
      ...(opts.includeDeleted ? {} : { deletedAt: null }),
    },
  });
  if (!doc) throw Errors.notFound('Document not found');
  return doc;
}

export async function assertConversationAccess(
  ctx: OrgContext,
  conversationId: string,
): Promise<Conversation> {
  const convo = await prisma.conversation.findFirst({
    where: { id: conversationId, organizationId: ctx.organization.id, deletedAt: null },
  });
  if (!convo) throw Errors.notFound('Conversation not found');
  return convo;
}
