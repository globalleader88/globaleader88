import { env } from '@/env';

/**
 * Text chunking. Pure functions — no I/O — so they are fully unit-testable.
 *
 * Strategy: token-aware splitting with overlap, respecting natural boundaries
 * (paragraphs, then sentences) where possible, and carrying location metadata
 * (page / section / sheet / row range) onto each chunk so citations can point
 * back to the source. Token counts use a ~4 chars/token heuristic; the exact
 * value is not important as long as it is consistent with retrieval budgeting.
 */

export interface SourceSegment {
  text: string;
  page?: number;
  section?: string;
  sheet?: string;
  rowRange?: string;
}

export interface Chunk {
  content: string;
  tokenCount: number;
  page?: number;
  section?: string;
  sheet?: string;
  rowRange?: string;
}

export interface ChunkOptions {
  targetTokens?: number;
  overlapTokens?: number;
}

const CHARS_PER_TOKEN = 4;

export function estimateTokens(text: string): number {
  return Math.max(1, Math.ceil(text.length / CHARS_PER_TOKEN));
}

export function normalizeWhitespace(text: string): string {
  return text
    .replace(/\r\n?/g, '\n')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]+\n/g, '\n')
    .trim();
}

/**
 * Remove lines that repeat on most pages (typical running headers/footers).
 * Operates on the set of page-tagged segments; conservative so it never eats
 * real content that merely recurs a couple of times.
 */
export function stripRepeatedHeadersFooters(segments: SourceSegment[]): SourceSegment[] {
  const pages = new Set(segments.map((s) => s.page).filter((p): p is number => p != null));
  if (pages.size < 4) return segments;
  const counts = new Map<string, number>();
  for (const seg of segments) {
    const lines = seg.text.split('\n').map((l) => l.trim());
    const edge = [lines[0], lines[lines.length - 1]].filter(
      (l): l is string => !!l && l.length < 120,
    );
    for (const line of edge) counts.set(line, (counts.get(line) ?? 0) + 1);
  }
  const threshold = Math.ceil(pages.size * 0.6);
  const repeated = new Set([...counts.entries()].filter(([, c]) => c >= threshold).map(([l]) => l));
  if (repeated.size === 0) return segments;
  return segments.map((seg) => ({
    ...seg,
    text: seg.text
      .split('\n')
      .filter((l) => !repeated.has(l.trim()))
      .join('\n'),
  }));
}

function splitIntoUnits(text: string, target: number): string[] {
  // Prefer paragraph boundaries, then sentence boundaries for long paragraphs.
  const paragraphs = text
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean);
  const units: string[] = [];
  for (const para of paragraphs) {
    if (estimateTokens(para) <= target) {
      units.push(para);
    } else {
      const sentences = para.match(/[^.!?\n]+[.!?]?/g) ?? [para];
      for (const s of sentences) units.push(s.trim());
    }
  }
  return units;
}

/** Chunk a single segment, preserving its location metadata on every chunk. */
export function chunkSegment(segment: SourceSegment, options: ChunkOptions = {}): Chunk[] {
  const target = options.targetTokens ?? env.CHUNK_TARGET_TOKENS ?? 700;
  const overlap = Math.min(options.overlapTokens ?? env.CHUNK_OVERLAP_TOKENS ?? 100, target - 1);
  const text = normalizeWhitespace(segment.text);
  if (!text) return [];

  const units = splitIntoUnits(text, target);
  const chunks: Chunk[] = [];
  let buffer: string[] = [];
  let bufferTokens = 0;

  const flush = () => {
    if (buffer.length === 0) return;
    const content = buffer.join('\n\n').trim();
    if (content) {
      chunks.push({
        content,
        tokenCount: estimateTokens(content),
        page: segment.page,
        section: segment.section,
        sheet: segment.sheet,
        rowRange: segment.rowRange,
      });
    }
  };

  for (const unit of units) {
    const unitTokens = estimateTokens(unit);
    if (bufferTokens + unitTokens > target && buffer.length > 0) {
      flush();
      // Start next buffer with an overlap tail from the previous one.
      const tail: string[] = [];
      let tailTokens = 0;
      for (let i = buffer.length - 1; i >= 0 && tailTokens < overlap; i--) {
        tail.unshift(buffer[i] as string);
        tailTokens += estimateTokens(buffer[i] as string);
      }
      buffer = [...tail];
      bufferTokens = tailTokens;
    }
    buffer.push(unit);
    bufferTokens += unitTokens;
  }
  flush();
  return chunks;
}

/** Chunk an ordered list of segments into a flat, indexed chunk list. */
export function chunkDocument(segments: SourceSegment[], options: ChunkOptions = {}): Chunk[] {
  const cleaned = stripRepeatedHeadersFooters(segments);
  return cleaned.flatMap((seg) => chunkSegment(seg, options));
}
