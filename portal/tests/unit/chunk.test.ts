import { describe, it, expect } from 'vitest';
import {
  chunkDocument,
  chunkSegment,
  normalizeWhitespace,
  stripRepeatedHeadersFooters,
  estimateTokens,
} from '@/lib/documents/chunk';

describe('chunking', () => {
  it('normalizes whitespace without destroying content', () => {
    const out = normalizeWhitespace('Hello   world\r\n\r\n\r\n\r\nSecond   line');
    expect(out).toBe('Hello world\n\nSecond line');
  });

  it('produces chunks under the target token budget with overlap', () => {
    const paragraph = Array.from(
      { length: 40 },
      (_, i) => `Sentence number ${i} with some words.`,
    ).join(' ');
    const chunks = chunkSegment(
      { text: paragraph, page: 3 },
      { targetTokens: 60, overlapTokens: 10 },
    );
    expect(chunks.length).toBeGreaterThan(1);
    for (const c of chunks) {
      expect(c.tokenCount).toBeLessThanOrEqual(80); // target + overlap slack
      expect(c.page).toBe(3); // location metadata preserved
    }
  });

  it('carries location metadata onto every chunk', () => {
    const chunks = chunkDocument([
      { text: 'Alpha content here.', sheet: 'Sheet1', rowRange: '1-25' },
      { text: 'Beta content here.', section: 'Intro' },
    ]);
    expect(chunks[0]?.sheet).toBe('Sheet1');
    expect(chunks[1]?.section).toBe('Intro');
  });

  it('strips headers/footers that repeat across most pages', () => {
    const segments = Array.from({ length: 6 }, (_, i) => ({
      page: i + 1,
      text: `CONFIDENTIAL HEADER\nUnique body for page ${i + 1}.\nPage ${i + 1} of 6`,
    }));
    const cleaned = stripRepeatedHeadersFooters(segments);
    expect(cleaned.every((s) => !s.text.includes('CONFIDENTIAL HEADER'))).toBe(true);
    expect(cleaned[0]?.text).toContain('Unique body for page 1');
  });

  it('estimateTokens is monotonic in length', () => {
    expect(estimateTokens('a')).toBeLessThan(estimateTokens('a'.repeat(100)));
  });
});
