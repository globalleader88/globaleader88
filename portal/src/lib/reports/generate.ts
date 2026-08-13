import { prisma } from '@/lib/db';
import type { ReportType } from '@prisma/client';
import type { OrgContext } from '@/lib/authz';
import { getAIProvider } from '@/lib/ai';
import { resolveModelId } from '@/lib/ai/router';
import { searchChunks } from '@/lib/rag/vectors';
import { assembleContext } from '@/lib/rag/prompt';
import { recordUsage, assertWithinLimits } from '@/lib/usage/limits';
import { recordAudit, AuditAction } from '@/lib/audit';
import { REPORT_TEMPLATES, EVIDENCE_DISCLAIMER } from './templates';

/**
 * Report generation. Grounded and org-scoped like chat: retrieves relevant
 * excerpts within the organization, sends only those to the model, records
 * usage and an audit event, and stamps the output with the model id, date, and
 * an evidence disclaimer. Citations are stored alongside the report.
 */

export interface GenerateReportInput {
  type: ReportType;
  title?: string;
  documentScope?: string[];
}

export async function generateReport(
  ctx: OrgContext,
  input: GenerateReportInput,
): Promise<{ id: string }> {
  const template = REPORT_TEMPLATES[input.type];
  await assertWithinLimits(ctx.organization.id, ctx.user.id);

  const settings = await prisma.organizationSetting.findUnique({
    where: { organizationId: ctx.organization.id },
  });
  const modelId = resolveModelId(template.taskClass, settings);
  const maxContextTokens = settings?.maxContextTokens ?? 6000;
  const maxOutputTokens = Math.max(settings?.maxOutputTokens ?? 1024, 1500);
  const threshold = settings?.similarityThreshold ?? 0.2;
  const scope = input.documentScope ?? [];

  const report = await prisma.generatedReport.create({
    data: {
      organizationId: ctx.organization.id,
      createdById: ctx.user.id,
      type: input.type,
      status: 'GENERATING',
      title: input.title?.trim() || template.label,
      modelId,
      documentScope: scope,
    },
  });

  try {
    const ai = getAIProvider();
    const { embedding, tokens } = await ai.generateEmbedding(template.retrievalQuery);
    await recordUsage({
      organizationId: ctx.organization.id,
      userId: ctx.user.id,
      kind: 'embedding',
      modelId: 'embedding',
      embeddingTokens: tokens,
    });

    const chunks = await searchChunks({
      organizationId: ctx.organization.id,
      embedding,
      limit: (settings?.maxRetrievedChunks ?? 8) * 2,
      threshold,
      documentIds: scope.length > 0 ? scope : undefined,
    });

    const docIds = [...new Set(chunks.map((c) => c.documentId))];
    const docs = await prisma.document.findMany({
      where: { id: { in: docIds }, organizationId: ctx.organization.id },
      select: { id: true, title: true },
    });
    const titles = new Map(docs.map((d) => [d.id, d.title]));
    const { system, usedChunks } = assembleContext({
      chunks,
      documentTitles: titles,
      maxContextTokens,
    });

    if (usedChunks.length === 0) {
      const body = `# ${report.title}\n\n${EVIDENCE_DISCLAIMER}\n\nThe available documents do not contain enough information to generate this report.`;
      await prisma.generatedReport.update({
        where: { id: report.id },
        data: { status: 'COMPLETED', contentMarkdown: body },
      });
      return { id: report.id };
    }

    const result = await ai.generateText({
      system: `${system}\n\nTASK: ${template.instruction}`,
      messages: [{ role: 'user', content: template.instruction }],
      modelId,
      maxOutputTokens,
    });

    const citations = usedChunks.map((c, i) => ({
      n: i + 1,
      documentId: c.documentId,
      documentTitle: titles.get(c.documentId) ?? 'Document',
      page: c.page,
      section: c.section,
      sheet: c.sheet,
      rowRange: c.rowRange,
      similarity: Number(c.similarity.toFixed(4)),
    }));

    const header =
      `# ${report.title}\n\n` +
      `_Generated ${new Date().toISOString().slice(0, 10)} · Model: ${modelId}_\n\n` +
      `${EVIDENCE_DISCLAIMER}\n\n`;
    const sourcesBlock =
      `\n\n## Sources\n` +
      citations
        .map(
          (c) =>
            `- [${c.n}] ${c.documentTitle}${c.page ? `, p.${c.page}` : ''}${c.sheet ? `, sheet ${c.sheet}` : ''} (similarity ${c.similarity})`,
        )
        .join('\n');
    const contentMarkdown = header + result.text + sourcesBlock;

    await prisma.generatedReport.update({
      where: { id: report.id },
      data: {
        status: 'COMPLETED',
        contentMarkdown,
        citations: citations as unknown as object,
      },
    });

    await recordUsage({
      organizationId: ctx.organization.id,
      userId: ctx.user.id,
      kind: 'report',
      modelId,
      inputTokens: result.inputTokens,
      outputTokens: result.outputTokens,
    });
    await recordAudit({
      action: AuditAction.REPORT_GENERATED,
      organizationId: ctx.organization.id,
      userId: ctx.user.id,
      resourceType: 'report',
      resourceId: report.id,
      metadata: { type: input.type, citations: citations.length },
    });
    return { id: report.id };
  } catch (err) {
    await prisma.generatedReport.update({
      where: { id: report.id },
      data: { status: 'FAILED', error: 'Report generation failed' },
    });
    throw err;
  }
}
