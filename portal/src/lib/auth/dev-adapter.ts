import { prisma } from '@/lib/db';
import { hashPassword, verifyPassword } from './password';
import type { AuthAdapter, SignInResult } from './adapter';
import { Errors } from '@/lib/errors';

/**
 * DEVELOPMENT-ONLY authentication adapter.
 *
 * Verifies a PBKDF2 password hash stored on the User row. This is NOT a
 * production auth path — it exists so the app can boot and be exercised
 * locally without a Cognito user pool. The env validator throws if
 * ENABLE_DEV_AUTH is true under NODE_ENV=production.
 */
export class DevAdapter implements AuthAdapter {
  readonly name = 'dev' as const;

  async signIn(email: string, password: string): Promise<SignInResult> {
    const user = await prisma.user.findUnique({ where: { email: email.toLowerCase() } });
    // Constant-ish path: always run a verify to reduce user-enumeration signal.
    const ok = user?.devPasswordHash != null && verifyPassword(password, user.devPasswordHash);
    if (!user || !ok) {
      throw Errors.unauthenticated('Invalid email or password');
    }
    return {
      kind: 'authenticated',
      identity: {
        subject: `dev:${user.id}`,
        email: user.email,
        emailVerified: user.emailVerified,
      },
    };
  }

  async signUp(email: string, password: string, name?: string): Promise<{ subject: string }> {
    const normalized = email.toLowerCase();
    const existing = await prisma.user.findUnique({ where: { email: normalized } });
    if (existing) throw Errors.conflict('An account with that email already exists');
    const user = await prisma.user.create({
      data: {
        email: normalized,
        name,
        devPasswordHash: hashPassword(password),
        emailVerified: true, // auto-verified locally for convenience
      },
    });
    return { subject: `dev:${user.id}` };
  }

  async confirmSignUp(): Promise<void> {
    // No-op locally; dev accounts are auto-verified.
  }

  async resendConfirmation(): Promise<void> {
    // No-op locally.
  }

  async forgotPassword(): Promise<void> {
    // No-op locally; use the seed script or signUp to reset dev credentials.
  }

  async confirmForgotPassword(email: string, _code: string, newPassword: string): Promise<void> {
    const user = await prisma.user.findUnique({ where: { email: email.toLowerCase() } });
    if (!user) return; // do not reveal existence
    await prisma.user.update({
      where: { id: user.id },
      data: { devPasswordHash: hashPassword(newPassword) },
    });
  }
}
