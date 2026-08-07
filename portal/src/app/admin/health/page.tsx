import { loadSuperAdmin } from '@/server/context';
import { prisma } from '@/lib/db';
import { env } from '@/env';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

export const dynamic = 'force-dynamic';

export default async function AdminHealthPage() {
  await loadSuperAdmin();

  let dbOk = true;
  try {
    await prisma.$queryRaw`SELECT 1`;
  } catch {
    dbOk = false;
  }

  const [queued, running, orgs, docs] = await Promise.all([
    prisma.processingJob.count({ where: { status: { in: ['QUEUED', 'RETRYING'] } } }),
    prisma.processingJob.count({ where: { status: 'RUNNING' } }),
    prisma.organization.count(),
    prisma.document.count(),
  ]);

  const rows: Array<[string, string]> = [
    ['Database', dbOk ? 'Connected' : 'Unavailable'],
    ['AI driver', env.AI_DRIVER],
    ['Storage driver', env.STORAGE_DRIVER],
    ['Dev auth', env.ENABLE_DEV_AUTH ? 'ENABLED (non-production)' : 'disabled'],
    ['Jobs queued', String(queued)],
    ['Jobs running', String(running)],
    ['Organizations', String(orgs)],
    ['Documents', String(docs)],
  ];

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">System Health</h1>
      <Card>
        <CardHeader>
          <CardTitle>
            Status{' '}
            <Badge variant={dbOk ? 'success' : 'destructive'} className="ml-2">
              {dbOk ? 'Healthy' : 'Degraded'}
            </Badge>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="grid gap-2 text-sm sm:grid-cols-2">
            {rows.map(([k, v]) => (
              <div key={k} className="flex justify-between border-b py-2">
                <dt className="text-muted-foreground">{k}</dt>
                <dd className="font-medium">{v}</dd>
              </div>
            ))}
          </dl>
        </CardContent>
      </Card>
    </div>
  );
}
