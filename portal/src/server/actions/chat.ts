'use server';

import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { requireOrganizationMembership, assertConversationAccess } from '@/lib/authz';
import { answerQuestion } from '@/lib/rag/answer';
import { prisma } from '@/lib/db';
import { toPublicError } from '@/lib/errors';

/**
 * Chat/RAG server actions. Suspended orgs are blocked automatically because
 * requireOrganizationMembership (without allowSuspended) throws for them.
 */

export async function createConversationAction(documentScope: string[] = []) {
  const ctx = await requireOrganizationMembership();
  // Validate scoped ids actually belong to the org.
  let scope: string[] = [];
  if (documentScope.length > 0) {
    const owned = await prisma.document.findMany({
      where: { organizationId: ctx.organization.id, id: { in: documentScope }, deletedAt: null },
      select: { id: true },
    });
    scope = owned.map((d) => d.id);
  }
  const convo = await prisma.conversation.create({
    data: { organizationId: ctx.organization.id, createdById: ctx.user.id, documentScope: scope },
  });
  revalidatePath('/chat');
  return { ok: true as const, conversationId: convo.id };
}

const askSchema = z.object({
  conversationId: z.string().uuid(),
  question: z.string().min(1).max(4000),
});

export async function askAction(input: z.infer<typeof askSchema>) {
  const ctx = await requireOrganizationMembership();
  const parsed = askSchema.safeParse(input);
  if (!parsed.success) return { ok: false as const, error: 'Invalid question' };
  try {
    const convo = await assertConversationAccess(ctx, parsed.data.conversationId);
    const result = await answerQuestion(ctx, convo.id, parsed.data.question, convo.documentScope);
    revalidatePath(`/chat/${convo.id}`);
    return { ok: true as const, ...result };
  } catch (err) {
    return { ok: false as const, error: toPublicError(err).message };
  }
}
