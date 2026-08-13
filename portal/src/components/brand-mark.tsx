import Image from 'next/image';
import { cn } from '@/lib/utils';

/**
 * The Global Connects brand lockup — the real logo (public/logo.png) shown on a
 * white plate so the black wordmark stays legible on the app's dark theme.
 * Swap the source here to update the logo everywhere it appears.
 */
export function BrandMark({
  className,
  size = 'md',
}: {
  className?: string;
  size?: 'sm' | 'md' | 'lg';
}) {
  const dims =
    size === 'lg'
      ? { h: 44, w: 70, pad: 'px-4 py-2.5' }
      : size === 'sm'
        ? { h: 30, w: 48, pad: 'px-2.5 py-1.5' }
        : { h: 38, w: 60, pad: 'px-3 py-2' };
  return (
    <div
      className={cn(
        'inline-flex items-center rounded-xl bg-white shadow-[0_0_0_1px_hsl(var(--primary)/0.2),0_0_22px_hsl(var(--primary)/0.28)]',
        dims.pad,
        className,
      )}
    >
      <Image
        src="/logo.png"
        alt="The Global Connects"
        width={350}
        height={220}
        priority
        style={{ height: dims.h, width: 'auto' }}
      />
    </div>
  );
}
