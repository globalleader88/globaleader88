import { describe, it, expect } from 'vitest';
import { validateUpload, sniffMatchesMime } from '@/lib/documents/validation';

const PDF_MIME = 'application/pdf';
const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

describe('upload validation', () => {
  it('accepts an allowed type with matching extension', () => {
    const r = validateUpload({ fileName: 'report.pdf', mimeType: PDF_MIME, sizeBytes: 1000 });
    expect(r.mime).toBe(PDF_MIME);
  });

  it('rejects an unsupported/executable type', () => {
    expect(() =>
      validateUpload({ fileName: 'evil.exe', mimeType: 'application/x-msdownload', sizeBytes: 10 }),
    ).toThrow(/Unsupported file type/);
  });

  it('rejects MIME/extension mismatch (spoofing)', () => {
    expect(() =>
      validateUpload({ fileName: 'report.pdf', mimeType: DOCX_MIME, sizeBytes: 1000 }),
    ).toThrow(/extension does not match/);
  });

  it('rejects empty and oversized files', () => {
    expect(() =>
      validateUpload({ fileName: 'a.txt', mimeType: 'text/plain', sizeBytes: 0 }),
    ).toThrow(/empty/);
    expect(() =>
      validateUpload({ fileName: 'a.txt', mimeType: 'text/plain', sizeBytes: 999 * 1024 * 1024 }),
    ).toThrow(/exceeds/);
  });

  it('sniffs magic bytes', () => {
    expect(sniffMatchesMime(Buffer.from('%PDF-1.7'), PDF_MIME)).toBe(true);
    expect(sniffMatchesMime(Buffer.from('not a pdf'), PDF_MIME)).toBe(false);
    // OOXML files are ZIP archives (PK\x03\x04).
    expect(sniffMatchesMime(Buffer.from([0x50, 0x4b, 0x03, 0x04]), DOCX_MIME)).toBe(true);
  });
});
