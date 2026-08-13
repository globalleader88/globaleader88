import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Tenant-isolation unit tests. Prisma and the session are mocked so we can
 * assert the authorization logic in isolation:
 *   - a browser-supplied/forged active-org hint is ignored unless a live
 *     membership backs it;
 *   - cross-organization document access resolves to NOT_FOUND (no existence
 *     disclosure);
 *   - role hierarchy is enforced.
 */

const prismaMock = vi.hoisted(() => ({
  organizationMembership: { findFirst: vi.fn() },
  document: { findFirst: vi.fn() },
  conversation: { findFirst: vi.fn() },
  user: { findFirst: vi.fn() },
}));

vi.mock('@/lib/db', () => ({ prisma: prismaMock }));
vi.mock('@/lib/auth/session', () => ({ getSession: vi.fn() }));

import {
  roleAtLeast,
  getAuthorizedOrganization,
  assertDocumentAccess,
  type OrgContext,
} from '@/lib/authz';
import { AppError } from '@/lib/errors';

const ORG_A = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const ORG_B = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const USER = 'cccccccc-cccc-cccc-cccc-cccccccccccc';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('role hierarchy', () => {
  it('enforces VIEWER < ANALYST < ADMIN', () => {
    expect(roleAtLeast('ADMIN', 'ANALYST')).toBe(true);
    expect(roleAtLeast('ANALYST', 'ADMIN')).toBe(false);
    expect(roleAtLeast('VIEWER', 'ANALYST')).toBe(false);
    expect(roleAtLeast('VIEWER', 'VIEWER')).toBe(true);
  });
});

describe('getAuthorizedOrganization', () => {
  it('ignores a session org hint the user is not a member of', async () => {
    // First lookup (the hint) returns null -> not a member of ORG_B.
    prismaMock.organizationMembership.findFirst
      .mockResolvedValueOnce(null) // hint check
      .mockResolvedValueOnce({
        // fallback: user's real membership in ORG_A
        id: 'm1',
        userId: USER,
        organizationId: ORG_A,
        role: 'ANALYST',
        status: 'ACTIVE',
        organization: { id: ORG_A, deletedAt: null, status: 'ACTIVE' },
      });

    const resolved = await getAuthorizedOrganization(USER, {
      userId: USER,
      activeOrganizationId: ORG_B, // forged / stale hint
      createdAt: Date.now(),
    });

    expect(resolved?.organization.id).toBe(ORG_A);
    // The hint lookup must be constrained to the user + that org + ACTIVE.
    const firstCallArg = prismaMock.organizationMembership.findFirst.mock.calls[0]?.[0];
    expect(firstCallArg.where).toMatchObject({
      userId: USER,
      organizationId: ORG_B,
      status: 'ACTIVE',
    });
  });

  it('returns null when the user has no active membership anywhere', async () => {
    prismaMock.organizationMembership.findFirst.mockResolvedValue(null);
    const resolved = await getAuthorizedOrganization(USER, null);
    expect(resolved).toBeNull();
  });
});

describe('assertDocumentAccess', () => {
  const ctx = {
    organization: { id: ORG_A },
    user: { id: USER },
  } as unknown as OrgContext;

  it('always scopes the query by the caller organization', async () => {
    prismaMock.document.findFirst.mockResolvedValue({ id: 'doc1', organizationId: ORG_A });
    await assertDocumentAccess(ctx, 'doc1');
    const arg = prismaMock.document.findFirst.mock.calls[0]?.[0];
    expect(arg.where).toMatchObject({ id: 'doc1', organizationId: ORG_A, deletedAt: null });
  });

  it('throws NOT_FOUND for a document in another organization', async () => {
    // Cross-org lookup yields nothing because of the org filter.
    prismaMock.document.findFirst.mockResolvedValue(null);
    await expect(assertDocumentAccess(ctx, 'doc-in-org-b')).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
    await expect(assertDocumentAccess(ctx, 'doc-in-org-b')).rejects.toBeInstanceOf(AppError);
  });
});
