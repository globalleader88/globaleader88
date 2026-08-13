import { cn } from '@/lib/utils';
import type { FormState } from '@/server/actions/auth';

export function FormMessage({ state }: { state: FormState }) {
  if (!state.error && !state.message) return null;
  return (
    <p
      role="status"
      className={cn(
        'rounded-md border px-3 py-2 text-sm',
        state.error
          ? 'border-destructive/40 bg-destructive/10 text-destructive'
          : 'border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400',
      )}
    >
      {state.error ?? state.message}
    </p>
  );
}
