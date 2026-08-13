/**
 * Authentication adapter contract. Two implementations exist:
 *
 *   - CognitoAdapter  — production. Delegates all credential handling to
 *     Amazon Cognito (email/password, verification, reset, MFA challenges).
 *   - DevAdapter      — local development ONLY. Verifies a PBKDF2 hash stored
 *     on the User row. Hard-disabled when ENABLE_DEV_AUTH=false, and the env
 *     validator refuses to boot production with dev auth enabled.
 *
 * The adapter's job is narrow: prove that the caller controls an email
 * identity and return the verified identity. Session issuance, organization
 * resolution, and role checks all happen above this layer.
 */

export interface VerifiedIdentity {
  /** Stable external subject (Cognito `sub`, or `dev:<uuid>` locally). */
  subject: string;
  email: string;
  emailVerified: boolean;
}

export type SignInResult =
  | { kind: 'authenticated'; identity: VerifiedIdentity }
  | { kind: 'challenge'; challenge: 'MFA' | 'NEW_PASSWORD_REQUIRED'; session: string };

export interface AuthAdapter {
  readonly name: 'cognito' | 'dev';
  signIn(email: string, password: string): Promise<SignInResult>;
  signUp(email: string, password: string, name?: string): Promise<{ subject: string }>;
  confirmSignUp(email: string, code: string): Promise<void>;
  resendConfirmation(email: string): Promise<void>;
  forgotPassword(email: string): Promise<void>;
  confirmForgotPassword(email: string, code: string, newPassword: string): Promise<void>;
}
