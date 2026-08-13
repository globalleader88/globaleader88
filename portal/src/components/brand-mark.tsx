import { cn } from '@/lib/utils';

/**
 * Brand lockup for The Global Connects: a "GC" monogram tile + wordmark.
 *
 * The monogram is a placeholder for the company logo — drop the real logo file
 * in `public/logo.svg` and swap the `<div className="...monogram">` for an
 * `<Image src="/logo.svg" ... />` to use it everywhere at once.
 */
export function BrandMark({
  className,
  subtitle = 'Client Intelligence',
  size = 'md',
}: {
  className?: string;
  subtitle?: string;
  size?: 'sm' | 'md' | 'lg';
}) {
  const tile =
    size === 'lg' ? 'h-11 w-11 text-lg' : size === 'sm' ? 'h-8 w-8 text-xs' : 'h-10 w-10 text-sm';
  const title = size === 'lg' ? 'text-lg' : 'text-[15px]';
  return (
    <div className={cn('flex items-center gap-3', className)}>
      <div
        className={cn(
          'grid shrink-0 place-items-center rounded-xl border border-primary/40 font-mono font-bold tracking-tight text-white',
          'bg-[linear-gradient(150deg,hsl(217_45%_28%),hsl(220_50%_16%))]',
          'shadow-[0_0_0_1px_hsl(var(--primary)/0.25),0_0_22px_hsl(var(--primary)/0.4)]',
          tile,
        )}
        aria-hidden="true"
      >
        GC
      </div>
      <div className="leading-tight">
        <div className={cn('font-bold tracking-tight', title)}>The Global Connects</div>
        {subtitle && (
          <div className="text-[10px] font-medium uppercase tracking-[0.2em] text-[hsl(var(--accent-2))]">
            {subtitle}
          </div>
        )}
      </div>
    </div>
  );
}
