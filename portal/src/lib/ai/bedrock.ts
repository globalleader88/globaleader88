import {
  BedrockRuntimeClient,
  InvokeModelCommand,
  InvokeModelWithResponseStreamCommand,
} from '@aws-sdk/client-bedrock-runtime';
import { env } from '@/env';
import { Errors } from '@/lib/errors';
import { logger } from '@/lib/logger';
import type {
  AIProvider,
  EmbeddingResult,
  GenerateTextOptions,
  GenerateTextResult,
} from './provider';

/**
 * Amazon Bedrock provider. Uses the Anthropic Messages schema for Claude chat
 * models and Amazon Titan for embeddings. Errors are wrapped so upstream
 * failures never leak model/account internals to the client.
 */
export class BedrockProvider implements AIProvider {
  readonly name = 'bedrock';
  private readonly client: BedrockRuntimeClient;

  constructor() {
    this.client = new BedrockRuntimeClient({ region: env.AWS_REGION });
  }

  countTokens(text: string): number {
    return Math.max(1, Math.ceil(text.length / 4));
  }

  private anthropicBody(opts: GenerateTextOptions) {
    return {
      anthropic_version: 'bedrock-2023-05-31',
      max_tokens: opts.maxOutputTokens,
      temperature: opts.temperature ?? 0.2,
      system: opts.system,
      messages: opts.messages
        .filter((m) => m.role !== 'system')
        .map((m) => ({ role: m.role, content: [{ type: 'text', text: m.content }] })),
    };
  }

  async generateText(opts: GenerateTextOptions): Promise<GenerateTextResult> {
    try {
      const res = await this.client.send(
        new InvokeModelCommand({
          modelId: opts.modelId,
          contentType: 'application/json',
          accept: 'application/json',
          body: JSON.stringify(this.anthropicBody(opts)),
        }),
      );
      const parsed = JSON.parse(Buffer.from(res.body).toString('utf-8'));
      const text: string =
        parsed.content?.map((c: { text?: string }) => c.text ?? '').join('') ?? '';
      return {
        text,
        modelId: opts.modelId,
        inputTokens: parsed.usage?.input_tokens ?? this.countTokens(opts.system),
        outputTokens: parsed.usage?.output_tokens ?? this.countTokens(text),
      };
    } catch (err) {
      logger.error('bedrock.generateText failed', { action: 'ai.generate', status: 'error' });
      throw Errors.upstream('The AI service is temporarily unavailable', String(err));
    }
  }

  async *streamText(opts: GenerateTextOptions): AsyncGenerator<string, GenerateTextResult, void> {
    let inputTokens = this.countTokens(opts.system);
    let outputTokens = 0;
    let full = '';
    try {
      const res = await this.client.send(
        new InvokeModelWithResponseStreamCommand({
          modelId: opts.modelId,
          contentType: 'application/json',
          accept: 'application/json',
          body: JSON.stringify(this.anthropicBody(opts)),
        }),
      );
      for await (const event of res.body ?? []) {
        if (!event.chunk?.bytes) continue;
        const evt = JSON.parse(Buffer.from(event.chunk.bytes).toString('utf-8'));
        if (evt.type === 'content_block_delta' && evt.delta?.text) {
          full += evt.delta.text;
          yield evt.delta.text as string;
        } else if (evt.type === 'message_start' && evt.message?.usage?.input_tokens) {
          inputTokens = evt.message.usage.input_tokens;
        } else if (evt.type === 'message_delta' && evt.usage?.output_tokens) {
          outputTokens = evt.usage.output_tokens;
        }
      }
    } catch (err) {
      logger.error('bedrock.streamText failed', { action: 'ai.stream', status: 'error' });
      throw Errors.upstream('The AI service is temporarily unavailable', String(err));
    }
    return {
      text: full,
      modelId: opts.modelId,
      inputTokens,
      outputTokens: outputTokens || this.countTokens(full),
    };
  }

  async generateEmbedding(text: string): Promise<EmbeddingResult> {
    const modelId = env.AWS_BEDROCK_EMBEDDING_MODEL_ID;
    try {
      const isTitan = modelId.startsWith('amazon.titan-embed');
      const body = isTitan
        ? { inputText: text, dimensions: env.AWS_BEDROCK_EMBEDDING_DIMENSION, normalize: true }
        : { texts: [text], input_type: 'search_document' };
      const res = await this.client.send(
        new InvokeModelCommand({
          modelId,
          contentType: 'application/json',
          accept: 'application/json',
          body: JSON.stringify(body),
        }),
      );
      const parsed = JSON.parse(Buffer.from(res.body).toString('utf-8'));
      const embedding: number[] = isTitan ? parsed.embedding : parsed.embeddings?.[0];
      if (!Array.isArray(embedding)) throw new Error('No embedding returned');
      return {
        embedding,
        modelId,
        tokens: parsed.inputTextTokenCount ?? this.countTokens(text),
      };
    } catch (err) {
      logger.error('bedrock.generateEmbedding failed', { action: 'ai.embed', status: 'error' });
      throw Errors.upstream('The embedding service is temporarily unavailable', String(err));
    }
  }
}
