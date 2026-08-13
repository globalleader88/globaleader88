import { loadSuperAdmin } from '@/server/context';
import { prisma } from '@/lib/db';
import { Card, CardContent } from '@/components/ui/card';
import { formatUsd } from '@/lib/utils';

export const dynamic = 'force-dynamic';

export default async function AdminUsagePage() {
  await loadSuperAdmin();
  const monthStart = new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), 1));
  const byOrg = await prisma.usageRecord.groupBy({
    by: ['organizationId'],
    where: { createdAt: { gte: monthStart } },
    _sum: {
      inputTokens: true,
      outputTokens: true,
      embeddingTokens: true,
      estimatedCostMicroUsd: true,
    },
    _count: true,
  });
  const orgs = await prisma.organization.findMany({ select: { id: true, name: true } });
  const nameOf = new Map(orgs.map((o) => [o.id, o.name]));

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Platform Usage (month to date)</h1>
      <Card>
        <CardContent className="p-0">
          <table className="w-full text-sm">
            <thead className="border-b bg-muted/40 text-left text-xs uppercase text-muted-foreground">
              <tr>
                <th className="p-3">Organization</th>
                <th className="p-3">Requests</th>
                <th className="p-3">Tokens</th>
                <th className="p-3">Est. cost</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {byOrg.map((r) => (
                <tr key={r.organizationId}>
                  <td className="p-3 font-medium">
                    {nameOf.get(r.organizationId) ?? r.organizationId}
                  </td>
                  <td className="p-3">{r._count}</td>
                  <td className="p-3">
                    {(
                      (r._sum.inputTokens ?? 0) +
                      (r._sum.outputTokens ?? 0) +
                      (r._sum.embeddingTokens ?? 0)
                    ).toLocaleString()}
                  </td>
                  <td className="p-3">{formatUsd(r._sum.estimatedCostMicroUsd ?? 0n)}</td>
                </tr>
              ))}
              {byOrg.length === 0 && (
                <tr>
                  <td className="p-3 text-muted-foreground" colSpan={4}>
                    No usage this month.
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
