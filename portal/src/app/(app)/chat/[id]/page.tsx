import { notFound } from 'next/navigation';
import { loadOrgContext } from '@/server/context';
import { assertConversationAccess } from '@/lib/authz';
import { prisma } from '@/lib/db';
import { AppError } from '@/lib/errors';
import { ChatPanel, type UiMessage } from '@/components/chat-panel';

export const dynamic = 'force-dynamic';

export default async function ConversationPage({ params }: { params: { id: string } }) {
  const ctx = await loadOrgContext();
  try {
    await assertConversationAccess(ctx, params.id);
  } catch (err) {
    if (err instanceof AppError && err.code === 'NOT_FOUND') notFound();
    throw err;
  }

  const messages = await prisma.message.findMany({
    where: { organizationId: ctx.organization.id, conversationId: params.id },
    orderBy: { createdAt: 'asc' },
    include: { citations: { include: { document: { select: { title: true } } } } },
  });

  const initial: UiMessage[] = messages.map((m) => ({
    id: m.id,
    role: m.role === 'ASSISTANT' ? 'ASSISTANT' : 'USER',
    content: m.content,
    insufficientEvidence: m.insufficientEvidence,
    citations: m.citations.map((c, i) => ({
      index: i + 1,
      documentId: c.documentId,
      documentTitle: c.document.title,
      page: c.page,
      section: c.section,
      sheet: c.sheet,
      rowRange: c.rowRange,
      similarity: c.similarity,
      excerpt: c.excerpt,
    })),
  }));

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">Conversation</h1>
      <ChatPanel conversationId={params.id} initialMessages={initial} />
    </div>
  );
}
