import Link from 'next/link';
import { redirect } from 'next/navigation';
import { loadOrgContext } from '@/server/context';
import { prisma } from '@/lib/db';
import { createConversationAction } from '@/server/actions/chat';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';

export const dynamic = 'force-dynamic';

async function startConversation() {
  'use server';
  const res = await createConversationAction([]);
  if (res.ok) redirect(`/chat/${res.conversationId}`);
}

export default async function ChatListPage() {
  const ctx = await loadOrgContext();
  const conversations = await prisma.conversation.findMany({
    where: { organizationId: ctx.organization.id, deletedAt: null },
    orderBy: { updatedAt: 'desc' },
    take: 50,
    include: { _count: { select: { messages: true } } },
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">AI Chat</h1>
          <p className="text-sm text-muted-foreground">
            Grounded, cited answers from your documents.
          </p>
        </div>
        <form action={startConversation}>
          <Button type="submit">New conversation</Button>
        </form>
      </div>

      <Card>
        <CardContent className="p-0">
          {conversations.length === 0 ? (
            <p className="p-6 text-sm text-muted-foreground">No conversations yet.</p>
          ) : (
            <ul className="divide-y">
              {conversations.map((c) => (
                <li key={c.id}>
                  <Link
                    href={`/chat/${c.id}`}
                    className="flex items-center justify-between p-4 hover:bg-accent/40"
                  >
                    <span className="font-medium">{c.title}</span>
                    <span className="text-xs text-muted-foreground">
                      {c._count.messages} message(s) · {c.updatedAt.toISOString().slice(0, 10)}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
