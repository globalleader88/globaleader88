import { pbkdf2Sync, randomBytes, createHash, timingSafeEqual } from 'node:crypto';

/**
 * Password + token cryptography.
 *
 * - `hashPassword` / `verifyPassword`: PBKDF2-SHA256, used ONLY by the dev auth
 *   adapter. Production authentication is delegated to Amazon Cognito, which
 *   stores no password material in this application.
 * - `sha256Hex`: one-way hashing for invite tokens and API keys (raw value
 *   shown once, only the hash is persisted).
 */

const PBKDF2_ITERATIONS = 210_000;
const KEY_LENGTH = 32;
const DIGEST = 'sha256';

export function hashPassword(password: string): string {
  const salt = randomBytes(16);
  const derived = pbkdf2Sync(password, salt, PBKDF2_ITERATIONS, KEY_LENGTH, DIGEST);
  return `pbkdf2$${PBKDF2_ITERATIONS}$${salt.toString('base64')}$${derived.toString('base64')}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const parts = stored.split('$');
  if (parts.length !== 4 || parts[0] !== 'pbkdf2') return false;
  const iterations = Number.parseInt(parts[1] ?? '', 10);
  const salt = Buffer.from(parts[2] ?? '', 'base64');
  const expected = Buffer.from(parts[3] ?? '', 'base64');
  if (!Number.isFinite(iterations) || salt.length === 0 || expected.length === 0) return false;
  const derived = pbkdf2Sync(password, salt, iterations, expected.length, DIGEST);
  return derived.length === expected.length && timingSafeEqual(derived, expected);
}

export function sha256Hex(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

/** URL-safe random token for invitations and API keys. */
export function generateToken(bytes = 32): string {
  return randomBytes(bytes).toString('base64url');
}
