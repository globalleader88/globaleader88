import { notFound } from 'next/navigation';
import { loadOrgContext } from '@/server/context';
import { prisma } from '@/lib/db';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

export const dynamic = 'force-dynamic';

export default async function ReportDetailPage({ params }: { params: { id: string } }) {
  const ctx = await loadOrgContext();
  // Org-scoped lookup: a report from another org resolves to notFound.
  const report = await prisma.generatedReport.findFirst({
    where: { id: params.id, organizationId: ctx.organization.id, deletedAt: null },
  });
  if (!report) notFound();

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">{report.title}</h1>
        <Badge variant={report.status === 'COMPLETED' ? 'success' : 'warning'}>
          {report.status}
        </Badge>
      </div>
      <p className="text-sm text-muted-foreground">
        {report.type} · {report.modelId ?? 'n/a'} · {report.createdAt.toISOString().slice(0, 10)}
      </p>
      <Card>
        <CardContent className="prose prose-sm max-w-none p-6 dark:prose-invert">
          {/* Markdown is rendered as preformatted text in the MVP; a Markdown
              renderer and DOCX/PDF export are clean follow-on enhancements. */}
          <pre className="whitespace-pre-wrap break-words font-sans text-sm">
            {report.contentMarkdown ?? report.error ?? 'No content.'}
          </pre>
        </CardContent>
      </Card>
    </div>
  );
}
