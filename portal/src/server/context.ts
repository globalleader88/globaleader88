import 'server-only';
import { redirect } from 'next/navigation';
import {
  requireAuthenticatedUser,
  requirePlatformSuperAdmin,
  requireOrganizationMembership,
  type AuthContext,
  type OrgContext,
} from '@/lib/authz';
import { AppError } from '@/lib/errors';

/**
 * Page-level context loaders. They translate authorization failures into
 * Next.js navigation (redirect to login) so pages stay declarative. Server
 * actions use the authz functions directly and surface typed errors instead.
 */

export async function loadAuth(): Promise<AuthContext> {
  try {
    return await requireAuthenticatedUser();
  } catch (err) {
    if (err instanceof AppError && err.code === 'UNAUTHENTICATED') redirect('/login');
    throw err;
  }
}

export async function loadSuperAdmin(): Promise<AuthContext> {
  try {
    return await requirePlatformSuperAdmin();
  } catch (err) {
    if (err instanceof AppError && err.code === 'UNAUTHENTICATED') redirect('/login');
    if (err instanceof AppError && err.code === 'FORBIDDEN') redirect('/dashboard');
    throw err;
  }
}

export async function loadOrgContext(): Promise<OrgContext> {
  // Resolve auth first so an expired session redirects to login before the
  // no-organization path is considered.
  await loadAuth();
  try {
    return await requireOrganizationMembership({ allowSuspended: true });
  } catch (err) {
    if (err instanceof AppError && err.code === 'FORBIDDEN') redirect('/no-organization');
    throw err;
  }
}
