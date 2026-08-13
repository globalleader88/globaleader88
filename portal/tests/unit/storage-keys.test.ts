import { describe, it, expect } from 'vitest';
import { buildDocumentKey, sanitizeFileName, assertKeyBelongsToOrg } from '@/lib/storage/keys';

const ORG_A = '11111111-1111-1111-1111-111111111111';
const ORG_B = '22222222-2222-2222-2222-222222222222';
const DOC = '33333333-3333-3333-3333-333333333333';
const VER = '44444444-4444-4444-4444-444444444444';

describe('storage keys', () => {
  it('builds an org-scoped, versioned key', () => {
    const key = buildDocumentKey({
      organizationId: ORG_A,
      documentId: DOC,
      versionId: VER,
      fileName: 'Q3 Report.pdf',
    });
    expect(key).toBe(`organizations/${ORG_A}/documents/${DOC}/${VER}/Q3_Report.pdf`);
  });

  it('sanitizes path traversal and directory components in file names', () => {
    expect(sanitizeFileName('../../etc/passwd')).toBe('passwd');
    expect(sanitizeFileName('..\\..\\windows\\system32')).toBe('system32');
    expect(sanitizeFileName('.hidden')).toBe('hidden');
    expect(sanitizeFileName('a/b/c.txt')).toBe('c.txt');
  });

  it('rejects non-uuid identifiers (no browser-supplied paths)', () => {
    expect(() =>
      buildDocumentKey({
        organizationId: 'not-a-uuid',
        documentId: DOC,
        versionId: VER,
        fileName: 'x.pdf',
      }),
    ).toThrow(/Invalid organizationId/);
  });

  it('assertKeyBelongsToOrg blocks cross-tenant object access', () => {
    const key = buildDocumentKey({
      organizationId: ORG_A,
      documentId: DOC,
      versionId: VER,
      fileName: 'x.pdf',
    });
    expect(() => assertKeyBelongsToOrg(key, ORG_A)).not.toThrow();
    expect(() => assertKeyBelongsToOrg(key, ORG_B)).toThrow(/does not belong/);
  });

  it('assertKeyBelongsToOrg rejects traversal in a stored key', () => {
    expect(() => assertKeyBelongsToOrg(`organizations/${ORG_A}/../${ORG_B}/x`, ORG_A)).toThrow();
  });
});
