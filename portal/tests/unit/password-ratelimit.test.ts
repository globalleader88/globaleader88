import { describe, it, expect } from 'vitest';
import { hashPassword, verifyPassword, sha256Hex, generateToken } from '@/lib/auth/password';
import { rateLimit } from '@/lib/ratelimit';

describe('password + token crypto', () => {
  it('verifies a correct password and rejects a wrong one', () => {
    const hash = hashPassword('correct horse battery staple');
    expect(verifyPassword('correct horse battery staple', hash)).toBe(true);
    expect(verifyPassword('wrong password', hash)).toBe(false);
  });

  it('produces unique salts (different hashes for same password)', () => {
    expect(hashPassword('same')).not.toBe(hashPassword('same'));
  });

  it('hashes tokens deterministically and generates url-safe tokens', () => {
    expect(sha256Hex('abc')).toBe(sha256Hex('abc'));
    expect(generateToken(16)).toMatch(/^[A-Za-z0-9_-]+$/);
  });
});

describe('rate limiting', () => {
  it('allows up to max then blocks within the window', async () => {
    const key = `test:${Math.random()}`;
    for (let i = 0; i < 3; i++) expect((await rateLimit(key, 3, 60)).allowed).toBe(true);
    expect((await rateLimit(key, 3, 60)).allowed).toBe(false);
  });
});
