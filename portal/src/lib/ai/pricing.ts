/**
 * Cost estimation. Prices are approximate USD per 1,000 tokens and are meant
 * for in-app budgeting and warnings, not billing. Keep them updated from the
 * Bedrock pricing page. Costs are tracked in micro-USD (1e-6 USD) integers to
 * avoid floating-point drift when summed across many requests.
 */

interface ModelPrice {
  inputPer1k: number;
  outputPer1k: number;
}

// Conservative defaults; override per-model as needed.
const PRICES: Record<string, ModelPrice> = {
  'anthropic.claude-3-haiku-20240307-v1:0': { inputPer1k: 0.00025, outputPer1k: 0.00125 },
  'anthropic.claude-3-5-sonnet-20240620-v1:0': { inputPer1k: 0.003, outputPer1k: 0.015 },
  'anthropic.claude-3-opus-20240229-v1:0': { inputPer1k: 0.015, outputPer1k: 0.075 },
  'amazon.titan-embed-text-v2:0': { inputPer1k: 0.00002, outputPer1k: 0 },
};

const FALLBACK: ModelPrice = { inputPer1k: 0.003, outputPer1k: 0.015 };

export function priceFor(modelId: string): ModelPrice {
  return PRICES[modelId] ?? FALLBACK;
}

/** Returns estimated cost in micro-USD (integer). */
export function estimateCostMicroUsd(
  modelId: string,
  inputTokens: number,
  outputTokens: number,
): bigint {
  const price = priceFor(modelId);
  const usd = (inputTokens / 1000) * price.inputPer1k + (outputTokens / 1000) * price.outputPer1k;
  return BigInt(Math.round(usd * 1_000_000));
}

export function microUsdToUsd(micro: bigint): number {
  return Number(micro) / 1_000_000;
}
