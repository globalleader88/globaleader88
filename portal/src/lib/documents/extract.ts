import { parse as parseCsv } from 'csv-parse/sync';
import type { SourceSegment } from './chunk';

/**
 * Text extraction. Each extractor returns location-tagged segments so chunks
 * can carry page/sheet/row/section metadata for citations. Heavy native
 * parsers (pdf-parse, mammoth, xlsx) are imported dynamically so they only
 * load inside the worker/route that needs them.
 *
 * Extracted text is UNTRUSTED. It is never executed and only ever placed into
 * the clearly-delimited document-content region of a prompt (see rag/prompt).
 */

export type Extractor = (buffer: Buffer, fileName: string) => Promise<SourceSegment[]>;

const extractTxt: Extractor = async (buffer) => {
  return [{ text: buffer.toString('utf-8') }];
};

const extractPdf: Extractor = async (buffer) => {
  const { default: pdfParse } = await import('pdf-parse');
  // pdf-parse concatenates pages with \f (form feed) when using the default
  // pagerender; we split on that to recover page numbers.
  const data = await pdfParse(buffer);
  const pages = data.text.split('\f');
  const segments: SourceSegment[] = [];
  pages.forEach((pageText, idx) => {
    const text = pageText.trim();
    if (text) segments.push({ text, page: idx + 1 });
  });
  return segments.length > 0 ? segments : [{ text: data.text }];
};

const extractDocx: Extractor = async (buffer) => {
  const mammoth = await import('mammoth');
  const { value } = await mammoth.extractRawText({ buffer });
  // Split on blank lines into paragraph-ish sections; headings become section
  // labels when they look like short standalone lines.
  const blocks = value
    .split(/\n\s*\n/)
    .map((b) => b.trim())
    .filter(Boolean);
  let currentSection: string | undefined;
  const segments: SourceSegment[] = [];
  for (const block of blocks) {
    if (block.length <= 80 && !/[.!?]$/.test(block) && block.split('\n').length === 1) {
      currentSection = block;
    }
    segments.push({ text: block, section: currentSection });
  }
  return segments;
};

const extractCsv: Extractor = async (buffer) => {
  const rows: string[][] = parseCsv(buffer.toString('utf-8'), {
    skip_empty_lines: true,
    relax_column_count: true,
  });
  if (rows.length === 0) return [];
  const header = rows[0] ?? [];
  const segments: SourceSegment[] = [];
  // Group data rows into small batches to keep chunk sizes reasonable.
  const BATCH = 25;
  for (let start = 1; start < rows.length; start += BATCH) {
    const batch = rows.slice(start, start + BATCH);
    const text = batch
      .map((row) => header.map((h, i) => `${h}: ${row[i] ?? ''}`).join('; '))
      .join('\n');
    segments.push({ text, rowRange: `${start}-${Math.min(start + BATCH - 1, rows.length - 1)}` });
  }
  return segments;
};

const extractXlsx: Extractor = async (buffer) => {
  const XLSX = await import('xlsx');
  const wb = XLSX.read(buffer, { type: 'buffer' });
  const segments: SourceSegment[] = [];
  for (const sheetName of wb.SheetNames) {
    const sheet = wb.Sheets[sheetName];
    if (!sheet) continue;
    const rows: string[][] = XLSX.utils.sheet_to_json(sheet, { header: 1, blankrows: false });
    if (rows.length === 0) continue;
    const header = rows[0] ?? [];
    const BATCH = 25;
    for (let start = 1; start < rows.length; start += BATCH) {
      const batch = rows.slice(start, start + BATCH);
      const text = batch
        .map((row) => header.map((h, i) => `${h}: ${row[i] ?? ''}`).join('; '))
        .join('\n');
      segments.push({
        text,
        sheet: sheetName,
        rowRange: `${start}-${Math.min(start + BATCH - 1, rows.length - 1)}`,
      });
    }
  }
  return segments;
};

const EXTRACTORS: Record<string, Extractor> = {
  'application/pdf': extractPdf,
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': extractDocx,
  'text/plain': extractTxt,
  'text/csv': extractCsv,
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': extractXlsx,
};

export async function extractText(
  mime: string,
  buffer: Buffer,
  fileName: string,
): Promise<SourceSegment[]> {
  const extractor = EXTRACTORS[mime];
  if (!extractor) throw new Error(`No extractor for MIME type ${mime}`);
  return extractor(buffer, fileName);
}
