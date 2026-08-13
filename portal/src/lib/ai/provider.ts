/**
 * Provider-agnostic AI interface. Amazon Bedrock is the default implementation;
 * a mock powers local dev and tests. Adding another approved provider means
 * implementing this interface — no call sites change.
 */

export type TaskClass = 'low' | 'standard' | 'advanced';

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface GenerateTextOptions {
  system: string;
  messages: ChatMessage[];
  modelId: string;
  maxOutputTokens: number;
  temperature?: number;
}

export interface GenerateTextResult {
  text: string;
  modelId: string;
  inputTokens: number;
  outputTokens: number;
}

export interface EmbeddingResult {
  embedding: number[];
  modelId: string;
  tokens: number;
}

export interface AIProvider {
  readonly name: string;
  generateText(opts: GenerateTextOptions): Promise<GenerateTextResult>;
  /** Async iterator of text deltas; resolves usage via the returned promise. */
  streamText(opts: GenerateTextOptions): AsyncGenerator<string, GenerateTextResult, void>;
  generateEmbedding(text: string): Promise<EmbeddingResult>;
  countTokens(text: string): number;
}
