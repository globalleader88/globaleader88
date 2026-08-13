import { env } from '@/env';
import type { AIProvider } from './provider';
import { MockProvider } from './mock';
import { BedrockProvider } from './bedrock';

let provider: AIProvider | null = null;

export function getAIProvider(): AIProvider {
  if (provider) return provider;
  provider = env.AI_DRIVER === 'bedrock' ? new BedrockProvider() : new MockProvider();
  return provider;
}

export type {
  AIProvider,
  TaskClass,
  ChatMessage,
  GenerateTextResult,
  EmbeddingResult,
} from './provider';
export { resolveModelId, taskClassForReport } from './router';
export { estimateCostMicroUsd, microUsdToUsd } from './pricing';
