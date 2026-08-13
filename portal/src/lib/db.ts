import { PrismaClient } from '@prisma/client';
import { env } from '@/env';

/**
 * Singleton Prisma client. In development Next.js hot-reloads modules, so we
 * cache the client on `globalThis` to avoid exhausting the connection pool.
 *
 * IMPORTANT: application code should not use this client directly for
 * client-owned data. Go through the tenant-scoped repositories in
 * `src/lib/authz` / `src/lib/repositories` so every query carries the
 * authorized organizationId.
 */

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: env.LOG_LEVEL === 'debug' ? ['query', 'warn', 'error'] : ['warn', 'error'],
  });

if (env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}
