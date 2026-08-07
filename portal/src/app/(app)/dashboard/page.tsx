import { loadOrgContext } from '@/server/context';
import { prisma } from '@/lib/db';
import { getUsageStatus } from '@/lib/usage/limits';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { formatBytes, formatUsd } from '@/lib/utils';

export const dynamic = 'force-dynamic';

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">{label}</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-semibold">{value}</div>
        {hint && <div className="mt-1 text-xs text-muted-foreground">{hint}</div>}
      </CardContent>
    </Card>
  );
}

export default async function DashboardPage() {
  const ctx = await loadOrgContext();
  const orgId = ctx.organization.id;

  const [total, processing, errored, storageAgg, monthStart, usage] = await Promise.all([
    prisma.document.count({ where: { organizationId: orgId, deletedAt: null } }),
    prisma.document.count({
      where: { organizationId: orgId, deletedAt: null, status: { in: ['PENDING', 'PROCESSING'] } },
    }),
    prisma.document.count({ where: { organizationId: orgId, deletedAt: null, status: 'FAILED' } }),
    prisma.documentVersion.aggregate({
      where: { organizationId: orgId },
      _sum: { fileSizeBytes: true },
    }),
    Promise.resolve(new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), 1))),
    getUsageStatus(orgId, ctx.user.id),
  ]);

  const questionsThisMonth = await prisma.usageRecord.count({
    where: { organizationId: orgId, kind: 'chat', createdAt: { gte: monthStart } },
  });
  const costAgg = await prisma.usageRecord.aggregate({
    where: { organizationId: orgId, createdAt: { gte: monthStart } },
    _sum: { estimatedCostMicroUsd: true },
  });
  const recent = await prisma.auditLog.findMany({
    where: { organizationId: orgId },
    orderBy: { createdAt: 'desc' },
    take: 10,
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Dashboard</h1>
        <p className="text-sm text-muted-foreground">Overview of {ctx.organization.name}</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Total documents" value={String(total)} />
        <Stat label="Processing" value={String(processing)} />
        <Stat label="With errors" value={String(errored)} />
        <Stat label="Questions this month" value={String(questionsThisMonth)} />
        <Stat
          label="Estimated AI cost (mo)"
          value={formatUsd(costAgg._sum.estimatedCostMicroUsd ?? 0n)}
        />
        <Stat label="Storage used" value={formatBytes(storageAgg._sum.fileSizeBytes ?? 0n)} />
        <Stat
          label="Monthly token budget"
          value={`${usage.monthlyPercent}%`}
          hint={`${usage.monthlyTokensUsed.toLocaleString()} / ${usage.monthlyTokenLimit.toLocaleString()}`}
        />
        <Stat
          label="Daily queries"
          value={`${usage.dailyQueriesUsed}/${usage.dailyQueryLimit}`}
          hint="Per user, resets daily"
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Recent activity</CardTitle>
        </CardHeader>
        <CardContent>
          {recent.length === 0 ? (
            <p className="text-sm text-muted-foreground">No activity yet.</p>
          ) : (
            <ul className="divide-y text-sm">
              {recent.map((e) => (
                <li key={e.id} className="flex items-center justify-between py-2">
                  <span className="font-mono text-xs">{e.action}</span>
                  <span className="text-muted-foreground">
                    {e.createdAt.toISOString().replace('T', ' ').slice(0, 16)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
