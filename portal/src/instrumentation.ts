/**
 * Next.js instrumentation hook. Runs once when the server process starts.
 *
 * The Node-only worker bootstrap lives in `instrumentation.node.ts` and is
 * imported ONLY under the `NEXT_RUNTIME === 'nodejs'` guard — this is the
 * pattern Next uses to keep node built-ins out of the Edge bundle.
 */
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    await import('./instrumentation.node');
  }
}
