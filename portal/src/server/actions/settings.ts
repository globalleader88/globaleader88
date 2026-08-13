'use server';

import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { requireOrganizationMembership } from '@/lib/authz';
import { prisma } from '@/lib/db';
import { recordAudit, AuditAction } from '@/lib/audit';
import { invalidateOrgCache } from '@/lib/rag/cache';
import { toPublicError } from '@/lib/errors';

export type SettingsFormResult = { ok: boolean; error?: string; message?: string };

const settingsSchema = z.object({
  monthlyTokenLimit: z.coerce.number().int().min(0),
  dailyQueryLimitPerUser: z.coerce.number().int().min(0),
  maxRetrievedChunks: z.coerce.number().int().min(1).max(50),
  maxContextTokens: z.coerce.number().int().min(500).max(100_000),
  maxOutputTokens: z.coerce.number().int().min(128).max(8192),
  warnThresholdPercent: z.coerce.number().int().min(1).max(100),
  similarityThreshold: z.coerce.number().min(0).max(1),
});

export async function updateSettingsAction(
  _prev: unknown,
  formData: FormData,
): Promise<SettingsFormResult> {
  const ctx = await requireOrganizationMembership({ minRole: 'ADMIN' });
  const parsed = settingsSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, error: 'Invalid settings values' };
  try {
    await prisma.organizationSetting.upsert({
      where: { organizationId: ctx.organization.id },
      create: {
        organizationId: ctx.organization.id,
        monthlyTokenLimit: BigInt(parsed.data.monthlyTokenLimit),
        dailyQueryLimitPerUser: parsed.data.dailyQueryLimitPerUser,
        maxRetrievedChunks: parsed.data.maxRetrievedChunks,
        maxContextTokens: parsed.data.maxContextTokens,
        maxOutputTokens: parsed.data.maxOutputTokens,
        warnThresholdPercent: parsed.data.warnThresholdPercent,
        similarityThreshold: parsed.data.similarityThreshold,
      },
      update: {
        monthlyTokenLimit: BigInt(parsed.data.monthlyTokenLimit),
        dailyQueryLimitPerUser: parsed.data.dailyQueryLimitPerUser,
        maxRetrievedChunks: parsed.data.maxRetrievedChunks,
        maxContextTokens: parsed.data.maxContextTokens,
        maxOutputTokens: parsed.data.maxOutputTokens,
        warnThresholdPercent: parsed.data.warnThresholdPercent,
        similarityThreshold: parsed.data.similarityThreshold,
      },
    });
    // Retrieval tuning / model routing changed → cached answers may be stale.
    await invalidateOrgCache(ctx.organization.id);
    await recordAudit({
      action: AuditAction.ORG_SETTING_CHANGED,
      organizationId: ctx.organization.id,
      userId: ctx.user.id,
      resourceType: 'organization_setting',
    });
    revalidatePath('/settings');
    return { ok: true, message: 'Settings saved.' };
  } catch (err) {
    return { ok: false as const, error: toPublicError(err).message };
  }
}

const retentionSchema = z.object({
  mode: z.enum(['INDEFINITE', 'DELETE_AFTER_DAYS']),
  retentionDays: z.coerce.number().int().min(1).max(3650).optional(),
  purgeGraceDays: z.coerce.number().int().min(0).max(365),
});

export async function updateRetentionAction(
  _prev: unknown,
  formData: FormData,
): Promise<SettingsFormResult> {
  const ctx = await requireOrganizationMembership({ minRole: 'ADMIN' });
  const parsed = retentionSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false as const, error: 'Invalid retention values' };
  const retentionDays =
    parsed.data.mode === 'DELETE_AFTER_DAYS' ? (parsed.data.retentionDays ?? null) : null;
  try {
    await prisma.retentionPolicy.upsert({
      where: { organizationId: ctx.organization.id },
      create: {
        organizationId: ctx.organization.id,
        mode: parsed.data.mode,
        retentionDays,
        purgeGraceDays: parsed.data.purgeGraceDays,
        updatedById: ctx.user.id,
      },
      update: {
        mode: parsed.data.mode,
        retentionDays,
        purgeGraceDays: parsed.data.purgeGraceDays,
        updatedById: ctx.user.id,
      },
    });
    await recordAudit({
      action: AuditAction.RETENTION_POLICY_CHANGED,
      organizationId: ctx.organization.id,
      userId: ctx.user.id,
      resourceType: 'retention_policy',
      metadata: { mode: parsed.data.mode, retentionDays: retentionDays ?? 0 },
    });
    revalidatePath('/settings');
    return { ok: true, message: 'Retention policy saved.' };
  } catch (err) {
    return { ok: false as const, error: toPublicError(err).message };
  }
}
