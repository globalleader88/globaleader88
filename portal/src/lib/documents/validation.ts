import { env } from '@/env';
import { Errors } from '@/lib/errors';

/**
 * Upload validation. We accept a fixed allow-list of business document types.
 * Executables, scripts, and anything not on the list are rejected. MIME type
 * is cross-checked against the file extension to blunt MIME spoofing; the
 * background worker additionally sniffs magic bytes before parsing.
 */

export interface AllowedType {
  mime: string;
  extensions: string[];
  label: string;
}

export const ALLOWED_TYPES: AllowedType[] = [
  { mime: 'application/pdf', extensions: ['pdf'], label: 'PDF' },
  {
    mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    extensions: ['docx'],
    label: 'Word (DOCX)',
  },
  { mime: 'text/plain', extensions: ['txt'], label: 'Text' },
  { mime: 'text/csv', extensions: ['csv'], label: 'CSV' },
  {
    mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    extensions: ['xlsx'],
    label: 'Excel (XLSX)',
  },
];

const BY_MIME = new Map(ALLOWED_TYPES.map((t) => [t.mime, t]));

export function extensionOf(fileName: string): string {
  const dot = fileName.lastIndexOf('.');
  return dot >= 0 ? fileName.slice(dot + 1).toLowerCase() : '';
}

export function maxUploadBytes(): number {
  return env.MAX_UPLOAD_SIZE_MB * 1024 * 1024;
}

export interface ValidatedUpload {
  mime: string;
  extension: string;
  label: string;
}

export function validateUpload(params: {
  fileName: string;
  mimeType: string;
  sizeBytes: number;
}): ValidatedUpload {
  const type = BY_MIME.get(params.mimeType);
  if (!type) {
    throw Errors.validation(
      `Unsupported file type. Allowed: ${ALLOWED_TYPES.map((t) => t.label).join(', ')}`,
    );
  }
  const ext = extensionOf(params.fileName);
  if (!type.extensions.includes(ext)) {
    // Extension/MIME mismatch — likely spoofed.
    throw Errors.validation('File extension does not match its content type');
  }
  if (params.sizeBytes <= 0) {
    throw Errors.validation('File is empty');
  }
  if (params.sizeBytes > maxUploadBytes()) {
    throw Errors.validation(`File exceeds the ${env.MAX_UPLOAD_SIZE_MB} MB limit`);
  }
  return { mime: type.mime, extension: ext, label: type.label };
}

/** Magic-byte sniff run by the worker after download, before parsing. */
export function sniffMatchesMime(buffer: Buffer, mime: string): boolean {
  const head = buffer.subarray(0, 8);
  switch (mime) {
    case 'application/pdf':
      return head.subarray(0, 5).toString('latin1') === '%PDF-';
    case 'application/vnd.openxmlformats-officedocument.wordprocessingml.document':
    case 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet':
      // OOXML files are ZIP archives: "PK\x03\x04".
      return head[0] === 0x50 && head[1] === 0x4b;
    case 'text/plain':
    case 'text/csv':
      return true; // text has no reliable signature; treated as inert.
    default:
      return false;
  }
}
