import { prisma } from '@/lib/db';
import { Errors } from '@/lib/errors';
import { estimateCostMicroUsd } from '@/lib/ai/pricing';

/**
 * Cost + usage controls. Two gates enforced before any billable AI call:
 *   - per-organization monthly token budget (hard stop)
 *   - per-user daily query limit (hard stop)
 * Plus a warning signal when the org crosses its warn threshold. Platform
 * super admins can override via the admin API (not exposed to org users).
 */

function monthStart(now = new Date()): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}

function dayStart(now = new Date()): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

export interface UsageStatus {
  monthlyTokensUsed: number;
  monthlyTokenLimit: number;
  monthlyPercent: number;
  dailyQueriesUsed: number;
  dailyQueryLimit: number;
  warn: boolean;
}

export async function getUsageStatus(organizationId: string, userId: string): Promise<UsageStatus> {
  const settings = await prisma.organizationSetting.findUnique({ where: { organizationId } });
  const monthlyTokenLimit = Number(settings?.monthlyTokenLimit ?? 5_000_000n);
  const dailyQueryLimit = settings?.dailyQueryLimitPerUser ?? 200;
  const warnPercent = settings?.warnThresholdPercent ?? 80;

  const monthAgg = await prisma.usageRecord.aggregate({
    where: { organizationId, createdAt: { gte: monthStart() } },
    _sum: { inputTokens: true, outputTokens: true, embeddingTokens: true },
  });
  const monthlyTokensUsed =
    (monthAgg._sum.inputTokens ?? 0) +
    (monthAgg._sum.outputTokens ?? 0) +
    (monthAgg._sum.embeddingTokens ?? 0);

  const dailyQueriesUsed = await prisma.usageRecord.count({
    where: { organizationId, userId, kind: 'chat', createdAt: { gte: dayStart() } },
  });

  const monthlyPercent =
    monthlyTokenLimit > 0 ? Math.round((monthlyTokensUsed / monthlyTokenLimit) * 100) : 0;

  return {
    monthlyTokensUsed,
    monthlyTokenLimit,
    monthlyPercent,
    dailyQueriesUsed,
    dailyQueryLimit,
    warn: monthlyPercent >= warnPercent,
  };
}

/** Throw if the org or user is over budget. Call before starting an AI query. */
export async function assertWithinLimits(
  organizationId: string,
  userId: string,
): Promise<UsageStatus> {
  const status = await getUsageStatus(organizationId, userId);
  if (status.monthlyTokensUsed >= status.monthlyTokenLimit) {
    throw Errors.usageLimit('Monthly AI usage limit reached for this organization');
  }
  if (status.dailyQueriesUsed >= status.dailyQueryLimit) {
    throw Errors.usageLimit('Daily query limit reached. Try again tomorrow.');
  }
  return status;
}

export interface RecordUsageInput {
  organizationId: string;
  userId?: string;
  kind: 'chat' | 'embedding' | 'report' | 'classification';
  modelId: string;
  inputTokens?: number;
  outputTokens?: number;
  embeddingTokens?: number;
  requestId?: string;
}

export async function recordUsage(input: RecordUsageInput): Promise<void> {
  const cost = estimateCostMicroUsd(input.modelId, input.inputTokens ?? 0, input.outputTokens ?? 0);
  await prisma.usageRecord.create({
    data: {
      organizationId: input.organizationId,
      userId: input.userId,
      kind: input.kind,
      modelId: input.modelId,
      inputTokens: input.inputTokens ?? 0,
      outputTokens: input.outputTokens ?? 0,
      embeddingTokens: input.embeddingTokens ?? 0,
      estimatedCostMicroUsd: cost,
      requestId: input.requestId,
    },
  });
}
