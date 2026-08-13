import { PrismaClient } from '@prisma/client';
import { pbkdf2Sync, randomBytes } from 'node:crypto';

/**
 * Seed script for local development. Creates a platform super admin, two demo
 * organizations (to exercise tenant isolation), and a user in each role. Uses
 * the dev auth adapter's PBKDF2 hash format. Idempotent by email/slug.
 *
 * Run: npm run seed
 */

const prisma = new PrismaClient();

function hashPassword(password: string): string {
  const salt = randomBytes(16);
  const derived = pbkdf2Sync(password, salt, 210_000, 32, 'sha256');
  return `pbkdf2$210000$${salt.toString('base64')}$${derived.toString('base64')}`;
}

const ADMIN_EMAIL = process.env.SEED_ADMIN_EMAIL ?? 'admin@globalconnects.local';
const ADMIN_PASSWORD = process.env.SEED_ADMIN_PASSWORD ?? 'ChangeMe!2026';

async function upsertUser(email: string, name: string, superAdmin = false) {
  return prisma.user.upsert({
    where: { email },
    update: {},
    create: {
      email,
      name,
      emailVerified: true,
      devPasswordHash: hashPassword(email === ADMIN_EMAIL ? ADMIN_PASSWORD : 'ChangeMe!2026'),
      platformRole: superAdmin ? 'SUPER_ADMIN' : 'MEMBER',
    },
  });
}

async function upsertOrg(slug: string, name: string) {
  const org = await prisma.organization.upsert({
    where: { slug },
    update: {},
    create: { slug, name },
  });
  await prisma.organizationSetting.upsert({
    where: { organizationId: org.id },
    update: {},
    create: {
      organizationId: org.id,
      monthlyTokenLimit: BigInt(process.env.DEFAULT_MONTHLY_TOKEN_LIMIT ?? '5000000'),
      dailyQueryLimitPerUser: Number(process.env.DEFAULT_DAILY_QUERY_LIMIT ?? '200'),
    },
  });
  await prisma.retentionPolicy.upsert({
    where: { organizationId: org.id },
    update: {},
    create: { organizationId: org.id, mode: 'INDEFINITE', purgeGraceDays: 7 },
  });
  return org;
}

async function membership(orgId: string, userId: string, role: 'ADMIN' | 'ANALYST' | 'VIEWER') {
  await prisma.organizationMembership.upsert({
    where: { organizationId_userId: { organizationId: orgId, userId } },
    update: { role, status: 'ACTIVE' },
    create: { organizationId: orgId, userId, role, status: 'ACTIVE' },
  });
}

async function main() {
  const superAdmin = await upsertUser(ADMIN_EMAIL, 'Platform Super Admin', true);
  const acmeAdmin = await upsertUser('orgadmin@acme.local', 'Acme Admin');
  const acmeAnalyst = await upsertUser('analyst@acme.local', 'Acme Analyst');
  const acmeViewer = await upsertUser('viewer@acme.local', 'Acme Viewer');
  const globexAdmin = await upsertUser('orgadmin@globex.local', 'Globex Admin');

  const acme = await upsertOrg('acme', 'Acme Federal Solutions');
  const globex = await upsertOrg('globex', 'Globex Contracting Group');

  // Super admin also holds an org membership so they can use the app UI.
  await membership(acme.id, superAdmin.id, 'ADMIN');
  await membership(acme.id, acmeAdmin.id, 'ADMIN');
  await membership(acme.id, acmeAnalyst.id, 'ANALYST');
  await membership(acme.id, acmeViewer.id, 'VIEWER');
  await membership(globex.id, globexAdmin.id, 'ADMIN');

  // eslint-disable-next-line no-console
  console.log(`Seed complete.
  Super admin : ${ADMIN_EMAIL} / ${ADMIN_PASSWORD}
  Acme admin  : orgadmin@acme.local / ChangeMe!2026
  Acme analyst: analyst@acme.local / ChangeMe!2026
  Acme viewer : viewer@acme.local / ChangeMe!2026
  Globex admin: orgadmin@globex.local / ChangeMe!2026`);
}

main()
  .catch((err) => {
    // eslint-disable-next-line no-console
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
