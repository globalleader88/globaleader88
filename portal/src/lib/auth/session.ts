import 'server-only';
import { cookies } from 'next/headers';
import { sealData, unsealData } from 'iron-session';
import { env } from '@/env';

/**
 * Server-side session. The only things stored in the encrypted cookie are the
 * authenticated user id and the *chosen* active organization id. The active
 * organization is still re-validated against a live membership on every
 * request (see authz.getAuthorizedOrganization) — the cookie is a hint, never
 * an authorization grant. The browser cannot forge tenancy by editing it: the
 * cookie is sealed (AEAD) with SESSION_SECRET.
 */

const COOKIE_NAME = 'gc_portal_session';
const TTL_SECONDS = 60 * 60 * 8; // 8h absolute session lifetime

export interface SessionData {
  userId: string;
  activeOrganizationId?: string;
  createdAt: number;
}

const cookieOptions = {
  httpOnly: true,
  secure: env.NODE_ENV === 'production',
  sameSite: 'lax' as const,
  path: '/',
  maxAge: TTL_SECONDS,
};

export async function getSession(): Promise<SessionData | null> {
  const raw = cookies().get(COOKIE_NAME)?.value;
  if (!raw) return null;
  try {
    const data = await unsealData<SessionData>(raw, {
      password: env.SESSION_SECRET,
      ttl: TTL_SECONDS,
    });
    if (!data?.userId) return null;
    return data;
  } catch {
    return null;
  }
}

export async function createSession(userId: string): Promise<void> {
  const data: SessionData = { userId, createdAt: Date.now() };
  const sealed = await sealData(data, { password: env.SESSION_SECRET, ttl: TTL_SECONDS });
  cookies().set(COOKIE_NAME, sealed, cookieOptions);
}

export async function setActiveOrganization(organizationId: string): Promise<void> {
  const current = await getSession();
  if (!current) return;
  const next: SessionData = { ...current, activeOrganizationId: organizationId };
  const sealed = await sealData(next, { password: env.SESSION_SECRET, ttl: TTL_SECONDS });
  cookies().set(COOKIE_NAME, sealed, cookieOptions);
}

export function destroySession(): void {
  cookies().set(COOKIE_NAME, '', { ...cookieOptions, maxAge: 0 });
}
