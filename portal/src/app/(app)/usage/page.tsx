import { loadOrgContext } from '@/server/context';
import { prisma } from '@/lib/db';
import { getUsageStatus } from '@/lib/usage/limits';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { formatUsd } from '@/lib/utils';

export const dynamic = 'force-dynamic';

export default async function UsagePage() {
  const ctx = await loadOrgContext();
  const orgId = ctx.organization.id;
  const usage = await getUsageStatus(orgId, ctx.user.id);

  const monthStart = new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), 1));
  const byKind = await prisma.usageRecord.groupBy({
    by: ['kind'],
    where: { organizationId: orgId, createdAt: { gte: monthStart } },
    _sum: {
      inputTokens: true,
      outputTokens: true,
      embeddingTokens: true,
      estimatedCostMicroUsd: true,
    },
    _count: true,
  });

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Usage</h1>

      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">Monthly token budget</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-semibold">{usage.monthlyPercent}%</div>
            <div className="mt-2 h-2 w-full rounded bg-muted">
              <div
                className={usage.warn ? 'h-2 rounded bg-amber-500' : 'h-2 rounded bg-primary'}
                style={{ width: `${Math.min(100, usage.monthlyPercent)}%` }}
              />
            </div>
            <div className="mt-2 text-xs text-muted-foreground">
              {usage.monthlyTokensUsed.toLocaleString()} /{' '}
              {usage.monthlyTokenLimit.toLocaleString()} tokens
              {usage.warn && (
                <Badge variant="warning" className="ml-2">
                  Warning threshold reached
                </Badge>
              )}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">Your daily queries</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-semibold">
              {usage.dailyQueriesUsed}/{usage.dailyQueryLimit}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">Estimated cost (mo)</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-semibold">
              {formatUsd(byKind.reduce((s, k) => s + (k._sum.estimatedCostMicroUsd ?? 0n), 0n))}
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>This month by activity</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <table className="w-full text-sm">
            <thead className="border-b bg-muted/40 text-left text-xs uppercase text-muted-foreground">
              <tr>
                <th className="p-3">Activity</th>
                <th className="p-3">Count</th>
                <th className="p-3">Input</th>
                <th className="p-3">Output</th>
                <th className="p-3">Embedding</th>
                <th className="p-3">Est. cost</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {byKind.map((k) => (
                <tr key={k.kind}>
                  <td className="p-3 font-medium">{k.kind}</td>
                  <td className="p-3">{k._count}</td>
                  <td className="p-3">{(k._sum.inputTokens ?? 0).toLocaleString()}</td>
                  <td className="p-3">{(k._sum.outputTokens ?? 0).toLocaleString()}</td>
                  <td className="p-3">{(k._sum.embeddingTokens ?? 0).toLocaleString()}</td>
                  <td className="p-3">{formatUsd(k._sum.estimatedCostMicroUsd ?? 0n)}</td>
                </tr>
              ))}
              {byKind.length === 0 && (
                <tr>
                  <td className="p-3 text-muted-foreground" colSpan={6}>
                    No usage recorded this month.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}
