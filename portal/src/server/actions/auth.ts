'use server';

import { z } from 'zod';
import { redirect } from 'next/navigation';
import { prisma } from '@/lib/db';
import { getAuthAdapter } from '@/lib/auth';
import { createSession, destroySession, getSession } from '@/lib/auth/session';
import { recordAudit, AuditAction } from '@/lib/audit';
import { getRequestMeta } from '@/lib/request-context';
import { acceptInvitation } from '@/lib/orgs/service';
import { toPublicError } from '@/lib/errors';
import { rateLimit } from '@/lib/ratelimit';

/**
 * Authentication server actions. These run only on the server. They validate
 * input with Zod, delegate credential handling to the auth adapter, then
 * establish the sealed session cookie and provision the local User row.
 */

export interface FormState {
  ok: boolean;
  error?: string;
  message?: string;
}

const emailPassword = z.object({
  email: z.string().email(),
  password: z.string().min(8).max(256),
});

/** Ensure a local User row exists for a verified identity; return its id. */
async function upsertLocalUser(identity: {
  subject: string;
  email: string;
  emailVerified: boolean;
}): Promise<string> {
  const email = identity.email.toLowerCase();
  const existing = await prisma.user.findFirst({
    where: { OR: [{ cognitoSub: identity.subject }, { email }] },
  });
  if (existing) {
    await prisma.user.update({
      where: { id: existing.id },
      data: {
        cognitoSub:
          existing.cognitoSub ?? (identity.subject.startsWith('dev:') ? null : identity.subject),
        emailVerified: existing.emailVerified || identity.emailVerified,
        lastLoginAt: new Date(),
      },
    });
    return existing.id;
  }
  const created = await prisma.user.create({
    data: {
      email,
      cognitoSub: identity.subject.startsWith('dev:') ? null : identity.subject,
      emailVerified: identity.emailVerified,
      lastLoginAt: new Date(),
    },
  });
  return created.id;
}

export async function signInAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const meta = getRequestMeta();
  const limit = await rateLimit(`signin:${meta.ipAddress ?? 'unknown'}`, 10, 60);
  if (!limit.allowed) return { ok: false, error: 'Too many attempts. Please wait and try again.' };

  const parsed = emailPassword.safeParse({
    email: formData.get('email'),
    password: formData.get('password'),
  });
  if (!parsed.success) return { ok: false, error: 'Enter a valid email and password.' };

  try {
    const result = await getAuthAdapter().signIn(parsed.data.email, parsed.data.password);
    if (result.kind === 'challenge') {
      return { ok: false, error: `Additional verification required (${result.challenge}).` };
    }
    const user = await prisma.user.findFirst({ where: { email: parsed.data.email.toLowerCase() } });
    if (user?.status === 'SUSPENDED') {
      await recordAudit({
        action: AuditAction.LOGIN_FAILED,
        userId: user.id,
        outcome: 'denied',
        ipAddress: meta.ipAddress,
        userAgent: meta.userAgent,
        requestId: meta.requestId,
        metadata: { reason: 'suspended' },
      });
      return { ok: false, error: 'Your account has been suspended.' };
    }
    const userId = await upsertLocalUser(result.identity);
    await createSession(userId);
    await recordAudit({
      action: AuditAction.LOGIN,
      userId,
      ipAddress: meta.ipAddress,
      userAgent: meta.userAgent,
      requestId: meta.requestId,
    });
  } catch (err) {
    await recordAudit({
      action: AuditAction.LOGIN_FAILED,
      outcome: 'failure',
      ipAddress: meta.ipAddress,
      userAgent: meta.userAgent,
      requestId: meta.requestId,
    });
    return { ok: false, error: toPublicError(err).message };
  }
  redirect('/dashboard');
}

export async function signUpAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const schema = emailPassword.extend({ name: z.string().max(120).optional() });
  const parsed = schema.safeParse({
    email: formData.get('email'),
    password: formData.get('password'),
    name: formData.get('name') || undefined,
  });
  if (!parsed.success) {
    return { ok: false, error: 'Password must be at least 8 characters and email must be valid.' };
  }
  try {
    await getAuthAdapter().signUp(parsed.data.email, parsed.data.password, parsed.data.name);
    await recordAudit({ action: AuditAction.SIGNUP, ...getRequestMeta() });
  } catch (err) {
    return { ok: false, error: toPublicError(err).message };
  }
  return {
    ok: true,
    message: 'Account created. You can now sign in (verify your email if prompted).',
  };
}

export async function forgotPasswordAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const parsed = z
    .object({ email: z.string().email() })
    .safeParse({ email: formData.get('email') });
  if (!parsed.success) return { ok: false, error: 'Enter a valid email.' };
  try {
    await getAuthAdapter().forgotPassword(parsed.data.email);
  } catch {
    // Do not reveal whether the email exists.
  }
  return {
    ok: true,
    message: 'If an account exists for that email, a reset code has been sent.',
  };
}

export async function acceptInvitationAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const token = String(formData.get('token') ?? '');
  const session = await getSession();
  if (!session) {
    return { ok: false, error: 'Please sign in with the invited email address first.' };
  }
  try {
    await acceptInvitation(session.userId, token);
  } catch (err) {
    return { ok: false, error: toPublicError(err).message };
  }
  redirect('/dashboard');
}

export async function signOutAction(): Promise<void> {
  const session = await getSession();
  if (session) {
    await recordAudit({ action: AuditAction.LOGOUT, userId: session.userId, ...getRequestMeta() });
  }
  destroySession();
  redirect('/login');
}
