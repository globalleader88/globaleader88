import { Errors } from '@/lib/errors';

/**
 * Server-controlled S3 object keys. The browser NEVER supplies or influences
 * the storage path — it only provides a display file name, which we sanitize
 * before embedding. This prevents path traversal and cross-organization
 * object access via key manipulation.
 *
 * Key shape:
 *   organizations/{organizationId}/documents/{documentId}/{versionId}/{safeName}
 */

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function sanitizeFileName(name: string): string {
  // Strip any directory components an attacker might smuggle in.
  const base = name.split(/[\\/]/).pop() ?? 'file';
  // Allow a conservative character set; collapse everything else.
  const cleaned = base
    .normalize('NFKD')
    .replace(/[^\w.\- ]+/g, '_')
    .replace(/\s+/g, '_')
    .replace(/_{2,}/g, '_')
    .replace(/^\.+/, '') // no leading dots (hidden files / traversal)
    .slice(0, 200);
  return cleaned.length > 0 ? cleaned : 'file';
}

function assertUuid(value: string, label: string): void {
  if (!UUID_RE.test(value)) throw Errors.validation(`Invalid ${label}`);
}

export function buildDocumentKey(params: {
  organizationId: string;
  documentId: string;
  versionId: string;
  fileName: string;
}): string {
  assertUuid(params.organizationId, 'organizationId');
  assertUuid(params.documentId, 'documentId');
  assertUuid(params.versionId, 'versionId');
  const safeName = sanitizeFileName(params.fileName);
  return `organizations/${params.organizationId}/documents/${params.documentId}/${params.versionId}/${safeName}`;
}

/**
 * Defence in depth: verify that a stored key actually belongs to the given
 * organization before we ever hand out a download URL. Guards against a bug or
 * tampered DB row leaking a cross-tenant object.
 */
export function assertKeyBelongsToOrg(key: string, organizationId: string): void {
  assertUuid(organizationId, 'organizationId');
  const prefix = `organizations/${organizationId}/`;
  if (!key.startsWith(prefix) || key.includes('..')) {
    throw Errors.forbidden('Object does not belong to this organization');
  }
}
