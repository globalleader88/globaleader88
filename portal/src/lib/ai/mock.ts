import { createHash } from 'node:crypto';
import { env } from '@/env';
import type {
  AIProvider,
  EmbeddingResult,
  GenerateTextOptions,
  GenerateTextResult,
} from './provider';

/**
 * Deterministic mock provider for local development and tests. It produces:
 *   - Stable pseudo-embeddings derived from a hash of the input (so the same
 *     text always maps to the same vector and cosine similarity is meaningful).
 *   - A canned answer that echoes that it is grounded only in the supplied
 *     context, so the RAG plumbing and citations can be exercised offline.
 *
 * No network calls, no cost. Selected via AI_DRIVER=mock (the default).
 */
export class MockProvider implements AIProvider {
  readonly name = 'mock';
  private readonly dim = env.AWS_BEDROCK_EMBEDDING_DIMENSION;

  countTokens(text: string): number {
    // ~4 chars/token heuristic — good enough for budgeting in dev.
    return Math.max(1, Math.ceil(text.length / 4));
  }

  async generateEmbedding(text: string): Promise<EmbeddingResult> {
    const vec = this.pseudoVector(text);
    return { embedding: vec, modelId: 'mock-embed', tokens: this.countTokens(text) };
  }

  private pseudoVector(text: string): number[] {
    const out = new Array<number>(this.dim);
    // Seed a simple xorshift from a hash of the normalized text.
    const seedHex = createHash('sha256').update(text.toLowerCase().trim()).digest('hex');
    let state = Number.parseInt(seedHex.slice(0, 8), 16) || 1;
    let norm = 0;
    for (let i = 0; i < this.dim; i++) {
      state ^= state << 13;
      state ^= state >>> 17;
      state ^= state << 5;
      const v = ((state >>> 0) / 0xffffffff) * 2 - 1;
      out[i] = v;
      norm += v * v;
    }
    const mag = Math.sqrt(norm) || 1;
    for (let i = 0; i < this.dim; i++) out[i] = (out[i] as number) / mag;
    return out;
  }

  async generateText(opts: GenerateTextOptions): Promise<GenerateTextResult> {
    const lastUser = [...opts.messages].reverse().find((m) => m.role === 'user');
    const text = this.answerFor(opts.system, lastUser?.content ?? '');
    const inputTokens =
      this.countTokens(opts.system) +
      opts.messages.reduce((n, m) => n + this.countTokens(m.content), 0);
    return {
      text,
      modelId: opts.modelId,
      inputTokens,
      outputTokens: this.countTokens(text),
    };
  }

  async *streamText(opts: GenerateTextOptions): AsyncGenerator<string, GenerateTextResult, void> {
    const result = await this.generateText(opts);
    for (const word of result.text.split(' ')) {
      yield word + ' ';
    }
    return result;
  }

  private answerFor(system: string, question: string): string {
    const hasContext = /<document_excerpts>[\s\S]*\S[\s\S]*<\/document_excerpts>/.test(system);
    if (!hasContext) {
      return 'The available documents do not contain enough information to answer this question.';
    }
    return (
      `Based only on the retrieved excerpts, here is a grounded answer to "${question.slice(0, 120)}". ` +
      'This mock response is generated offline for development; connect Amazon Bedrock ' +
      '(AI_DRIVER=bedrock) for real inference. Citations reference the excerpts provided.'
    );
  }
}
