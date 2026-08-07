import { z } from 'zod';
import { requireOrganizationMembership, assertConversationAccess } from '@/lib/authz';
import { streamAnswer } from '@/lib/rag/answer';
import { toPublicError } from '@/lib/errors';

/**
 * Streaming chat endpoint. Returns newline-delimited JSON (NDJSON):
 *   {"type":"delta","text":"..."}      — one per answer chunk
 *   {"type":"done", ...final}          — citations + insufficientEvidence
 *   {"type":"error","error":"..."}     — if generation fails mid-stream
 *
 * Auth, org resolution, and conversation access are checked BEFORE streaming
 * begins, so those failures return a normal JSON error with the right status.
 * Suspended orgs are blocked (requireOrganizationMembership without
 * allowSuspended). The session cookie authenticates the same-origin fetch.
 */

export const dynamic = 'force-dynamic';

const schema = z.object({
  conversationId: z.string().uuid(),
  question: z.string().min(1).max(4000),
});

export async function POST(req: Request): Promise<Response> {
  let ctx: Awaited<ReturnType<typeof requireOrganizationMembership>>;
  let body: z.infer<typeof schema>;
  let convo: Awaited<ReturnType<typeof assertConversationAccess>>;
  try {
    ctx = await requireOrganizationMembership();
    body = schema.parse(await req.json());
    convo = await assertConversationAccess(ctx, body.conversationId);
  } catch (err) {
    const e = toPublicError(err);
    return Response.json({ error: e.message }, { status: e.status });
  }

  const encoder = new TextEncoder();
  const gen = streamAnswer(ctx, convo.id, body.question, convo.documentScope);

  const stream = new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        const next = await gen.next();
        if (next.done) {
          controller.enqueue(
            encoder.encode(JSON.stringify({ type: 'done', ...next.value }) + '\n'),
          );
          controller.close();
        } else {
          controller.enqueue(
            encoder.encode(JSON.stringify({ type: 'delta', text: next.value }) + '\n'),
          );
        }
      } catch (err) {
        controller.enqueue(
          encoder.encode(
            JSON.stringify({ type: 'error', error: toPublicError(err).message }) + '\n',
          ),
        );
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'application/x-ndjson; charset=utf-8',
      'Cache-Control': 'no-store, no-transform',
      'X-Accel-Buffering': 'no',
    },
  });
}
