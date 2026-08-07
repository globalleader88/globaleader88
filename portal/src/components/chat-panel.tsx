'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import type { CitationOut } from '@/lib/rag/answer';

export interface UiMessage {
  id: string;
  role: 'USER' | 'ASSISTANT';
  content: string;
  insufficientEvidence?: boolean;
  citations?: CitationOut[];
}

export function ChatPanel({
  conversationId,
  initialMessages,
}: {
  conversationId: string;
  initialMessages: UiMessage[];
}) {
  const router = useRouter();
  const [messages, setMessages] = useState<UiMessage[]>(initialMessages);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function send(e: React.FormEvent) {
    e.preventDefault();
    const question = input.trim();
    if (!question || busy) return;
    setError(null);
    setBusy(true);

    const assistantId = `a-${Date.now()}`;
    setMessages((m) => [
      ...m,
      { id: `u-${Date.now()}`, role: 'USER', content: question },
      { id: assistantId, role: 'ASSISTANT', content: '' },
    ]);
    setInput('');

    const patchAssistant = (patch: Partial<UiMessage>) =>
      setMessages((m) => m.map((msg) => (msg.id === assistantId ? { ...msg, ...patch } : msg)));

    try {
      const res = await fetch('/api/chat/stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ conversationId, question }),
      });

      if (!res.ok || !res.body) {
        const detail = await res.json().catch(() => ({ error: 'Request failed' }));
        setError(detail.error ?? 'Request failed');
        setMessages((m) => m.filter((msg) => msg.id !== assistantId));
        return;
      }

      // Parse the NDJSON stream: {type:delta|done|error}.
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let answer = '';
      let streamError: string | null = null;

      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';
        for (const line of lines) {
          if (!line.trim()) continue;
          const event = JSON.parse(line) as {
            type: 'delta' | 'done' | 'error';
            text?: string;
            error?: string;
            citations?: CitationOut[];
            insufficientEvidence?: boolean;
          };
          if (event.type === 'delta') {
            answer += event.text ?? '';
            patchAssistant({ content: answer });
          } else if (event.type === 'done') {
            patchAssistant({
              content: answer,
              citations: event.citations,
              insufficientEvidence: event.insufficientEvidence,
            });
          } else if (event.type === 'error') {
            streamError = event.error ?? 'Generation failed';
          }
        }
      }

      if (streamError) {
        setError(streamError);
        if (!answer) setMessages((m) => m.filter((msg) => msg.id !== assistantId));
      }
      router.refresh();
    } catch {
      setError('Connection interrupted. Please try again.');
      setMessages((m) => m.filter((msg) => msg.id !== assistantId));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex h-[calc(100vh-8rem)] flex-col">
      <div className="flex-1 space-y-4 overflow-y-auto pr-2">
        {messages.length === 0 && (
          <p className="text-sm text-muted-foreground">
            Ask a question about your documents. Answers are grounded in your organization&apos;s
            uploaded content and include citations.
          </p>
        )}
        {messages.map((m) => (
          <div key={m.id} className={m.role === 'USER' ? 'flex justify-end' : 'flex justify-start'}>
            <div
              className={
                m.role === 'USER'
                  ? 'max-w-[80%] rounded-lg bg-primary px-4 py-2 text-sm text-primary-foreground'
                  : 'max-w-[85%] rounded-lg border bg-card px-4 py-3 text-sm'
              }
            >
              {m.role === 'ASSISTANT' && m.insufficientEvidence && (
                <Badge variant="warning" className="mb-2">
                  Insufficient evidence
                </Badge>
              )}
              <p className="whitespace-pre-wrap">{m.content}</p>
              {m.role === 'ASSISTANT' && (
                <div className="mt-2 flex items-center gap-2">
                  <button
                    className="text-xs text-muted-foreground hover:underline"
                    onClick={() => navigator.clipboard.writeText(m.content)}
                  >
                    Copy
                  </button>
                </div>
              )}
              {m.citations && m.citations.length > 0 && (
                <div className="mt-3 space-y-2 border-t pt-2">
                  <div className="text-xs font-semibold text-muted-foreground">Sources</div>
                  {m.citations.map((c) => (
                    <div key={c.index} className="rounded border bg-muted/30 p-2 text-xs">
                      <div className="flex items-center justify-between">
                        <Link
                          href={`/documents/${c.documentId}`}
                          className="font-medium hover:underline"
                        >
                          [{c.index}] {c.documentTitle}
                        </Link>
                        <span className="text-muted-foreground">
                          {[
                            c.page ? `p.${c.page}` : '',
                            c.sheet ? `sheet ${c.sheet}` : '',
                            `sim ${c.similarity}`,
                          ]
                            .filter(Boolean)
                            .join(' · ')}
                        </span>
                      </div>
                      <p className="mt-1 line-clamp-3 text-muted-foreground">{c.excerpt}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        ))}
        {busy && <p className="text-sm text-muted-foreground">Thinking…</p>}
        {error && <p className="text-sm text-destructive">{error}</p>}
      </div>

      <form onSubmit={send} className="mt-4 flex gap-2 border-t pt-4">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask about your documents…"
          className="flex h-10 flex-1 rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          disabled={busy}
        />
        <Button type="submit" disabled={busy || !input.trim()}>
          Send
        </Button>
      </form>
    </div>
  );
}
