import { redirect } from 'next/navigation';
import { loadOrgContext } from '@/server/context';
import { roleAtLeast } from '@/lib/authz';
import { prisma } from '@/lib/db';
import { env } from '@/env';
import { SettingsForms } from './settings-forms';

export const dynamic = 'force-dynamic';

export default async function SettingsPage() {
  const ctx = await loadOrgContext();
  if (!roleAtLeast(ctx.role, 'ADMIN')) redirect('/dashboard');

  const [settings, retention] = await Promise.all([
    prisma.organizationSetting.findUnique({ where: { organizationId: ctx.organization.id } }),
    prisma.retentionPolicy.findUnique({ where: { organizationId: ctx.organization.id } }),
  ]);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Organization settings</h1>
      <SettingsForms
        settings={{
          monthlyTokenLimit: String(settings?.monthlyTokenLimit ?? env.DEFAULT_MONTHLY_TOKEN_LIMIT),
          dailyQueryLimitPerUser: settings?.dailyQueryLimitPerUser ?? env.DEFAULT_DAILY_QUERY_LIMIT,
          maxRetrievedChunks: settings?.maxRetrievedChunks ?? 8,
          maxContextTokens: settings?.maxContextTokens ?? 6000,
          maxOutputTokens: settings?.maxOutputTokens ?? 1024,
          warnThresholdPercent: settings?.warnThresholdPercent ?? 80,
          similarityThreshold: settings?.similarityThreshold ?? 0.2,
        }}
        retention={{
          mode: retention?.mode ?? 'INDEFINITE',
          retentionDays: retention?.retentionDays ?? null,
          purgeGraceDays: retention?.purgeGraceDays ?? 7,
        }}
      />
    </div>
  );
}
