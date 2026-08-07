import { env } from '@/env';

/**
 * In-memory fixed-window rate limiter for the MVP. It protects auth and AI
 * endpoints against bursts from a single principal within one server instance.
 *
 * Production note: a multi-instance deployment needs a shared store (Redis or a
 * database counter) for a global limit. The interface here is intentionally
 * small so that backing store can be swapped without touching call sites.
 */

interface Bucket {
  count: number;
  resetAt: number;
}

const buckets = new Map<string, Bucket>();

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAt: number;
}

export function rateLimit(
  key: string,
  max = env.RATE_LIMIT_MAX_REQUESTS,
  windowSeconds = env.RATE_LIMIT_WINDOW_SECONDS,
): RateLimitResult {
  const now = Date.now();
  const windowMs = windowSeconds * 1000;
  const existing = buckets.get(key);

  if (!existing || existing.resetAt <= now) {
    const resetAt = now + windowMs;
    buckets.set(key, { count: 1, resetAt });
    return { allowed: true, remaining: max - 1, resetAt };
  }

  if (existing.count >= max) {
    return { allowed: false, remaining: 0, resetAt: existing.resetAt };
  }
  existing.count += 1;
  return { allowed: true, remaining: max - existing.count, resetAt: existing.resetAt };
}

/** Periodic cleanup to bound memory. Safe to call on a timer. */
export function sweepRateLimitBuckets(): void {
  const now = Date.now();
  for (const [key, bucket] of buckets.entries()) {
    if (bucket.resetAt <= now) buckets.delete(key);
  }
}
