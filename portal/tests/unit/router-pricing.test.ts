import { describe, it, expect } from 'vitest';
import { resolveModelId, taskClassForReport } from '@/lib/ai/router';
import { estimateCostMicroUsd, microUsdToUsd } from '@/lib/ai/pricing';

describe('model routing', () => {
  it('prefers per-org overrides, falls back to env defaults', () => {
    const settings = {
      lowCostModelId: 'org-low',
      standardModelId: null,
      advancedModelId: 'org-adv',
    };
    expect(resolveModelId('low', settings)).toBe('org-low');
    expect(resolveModelId('advanced', settings)).toBe('org-adv');
    // standard falls through to env default (non-empty string)
    expect(resolveModelId('standard', settings)).toBeTruthy();
  });

  it('maps report types to sensible task classes', () => {
    expect(taskClassForReport('DOCUMENT_SUMMARY')).toBe('low');
    expect(taskClassForReport('COMPLIANCE_MATRIX')).toBe('advanced');
    expect(taskClassForReport('EXECUTIVE_BRIEF')).toBe('standard');
  });
});

describe('cost estimation', () => {
  it('computes non-negative micro-USD costs and scales with tokens', () => {
    const model = 'anthropic.claude-3-5-sonnet-20240620-v1:0';
    const small = estimateCostMicroUsd(model, 1000, 500);
    const large = estimateCostMicroUsd(model, 10000, 5000);
    expect(small).toBeGreaterThan(0n);
    expect(large).toBeGreaterThan(small);
    expect(microUsdToUsd(small)).toBeGreaterThan(0);
  });
});
