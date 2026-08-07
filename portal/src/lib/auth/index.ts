import { env } from '@/env';
import type { AuthAdapter } from './adapter';
import { DevAdapter } from './dev-adapter';
import { CognitoAdapter } from './cognito-adapter';

let cached: AuthAdapter | null = null;

/** Resolve the active auth adapter based on environment configuration. */
export function getAuthAdapter(): AuthAdapter {
  if (cached) return cached;
  cached = env.ENABLE_DEV_AUTH ? new DevAdapter() : new CognitoAdapter();
  return cached;
}

export type { AuthAdapter, SignInResult, VerifiedIdentity } from './adapter';
