import { env } from '@/env';
import { prisma } from '@/lib/db';
import { logger } from '@/lib/logger';

/**
 * Fixed-window rate limiter with a pluggable store.
 *
 *   - `memory`   (default): per-process Map. Correct for a single instance.
 *   - `postgres`          : a shared counter table so a multi-instance
 *                           deployment enforces one global limit per key.
 *
 * Selection is via RATE_LIMIT_STORE. The `RateLimitStore` interface is the seam
 * a Redis/Upstash store would implement later without touching call sites.
 */

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAt: number;
}

export interface RateLimitStore {
  hit(key: string, max: number, windowSeconds: number): Promise<RateLimitResult>;
}

// ---------------------------------------------------------------------------
// In-memory store (default)
// ---------------------------------------------------------------------------

interface Bucket {
  count: number;
  resetAt: number;
}

class MemoryStore implements RateLimitStore {
  private buckets = new Map<string, Bucket>();

  async hit(key: string, max: number, windowSeconds: number): Promise<RateLimitResult> {
    const now = Date.now();
    const windowMs = windowSeconds * 1000;
    const existing = this.buckets.get(key);

    if (!existing || existing.resetAt <= now) {
      const resetAt = now + windowMs;
      this.buckets.set(key, { count: 1, resetAt });
      return { allowed: true, remaining: max - 1, resetAt };
    }
    if (existing.count >= max) {
      return { allowed: false, remaining: 0, resetAt: existing.resetAt };
    }
    existing.count += 1;
    return { allowed: true, remaining: max - existing.count, resetAt: existing.resetAt };
  }

  sweep(): void {
    const now = Date.now();
    for (const [key, bucket] of this.buckets.entries()) {
      if (bucket.resetAt <= now) this.buckets.delete(key);
    }
  }
}

// ---------------------------------------------------------------------------
// Postgres store (shared across instances)
// ---------------------------------------------------------------------------

class PostgresStore implements RateLimitStore {
  async hit(key: string, max: number, windowSeconds: number): Promise<RateLimitResult> {
    const windowMs = windowSeconds * 1000;
    const now = Date.now();
    // Align to the window boundary so all instances agree on the same bucket.
    const windowStart = new Date(Math.floor(now / windowMs) * windowMs);
    const resetAt = windowStart.getTime() + windowMs;
    const expiresAt = new Date(resetAt);

    try {
      // Atomic upsert-and-increment: the unique (bucketKey, windowStart) makes
      // concurrent hits serialize on the row.
      const rows = await prisma.$queryRaw<Array<{ count: number }>>`
        INSERT INTO rate_limit_counters (id, "bucketKey", "windowStart", count, "expiresAt")
        VALUES (gen_random_uuid(), ${key}, ${windowStart}, 1, ${expiresAt})
        ON CONFLICT ("bucketKey", "windowStart")
        DO UPDATE SET count = rate_limit_counters.count + 1
        RETURNING count
      `;
      const count = rows[0]?.count ?? 1;
      if (count > max) return { allowed: false, remaining: 0, resetAt };
      return { allowed: true, remaining: max - count, resetAt };
    } catch {
      // Fail open on store errors — a limiter outage must not lock users out.
      logger.error('ratelimit.store_error', { action: 'ratelimit', status: 'error' });
      return { allowed: true, remaining: max - 1, resetAt };
    }
  }
}

const memoryStore = new MemoryStore();
const store: RateLimitStore =
  env.RATE_LIMIT_STORE === 'postgres' ? new PostgresStore() : memoryStore;

/** Async rate-limit check using the configured store. */
export function rateLimit(
  key: string,
  max = env.RATE_LIMIT_MAX_REQUESTS,
  windowSeconds = env.RATE_LIMIT_WINDOW_SECONDS,
): Promise<RateLimitResult> {
  return store.hit(key, max, windowSeconds);
}

/** Periodic cleanup for the in-memory store; no-op for postgres. */
export function sweepRateLimitBuckets(): void {
  memoryStore.sweep();
}

/** Delete expired postgres counter rows. Call from a scheduled sweep. */
export async function purgeExpiredRateLimitCounters(): Promise<number> {
  if (env.RATE_LIMIT_STORE !== 'postgres') return 0;
  const res = await prisma.rateLimitCounter.deleteMany({
    where: { expiresAt: { lt: new Date() } },
  });
  return res.count;
}
