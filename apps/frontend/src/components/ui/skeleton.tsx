import { cn } from '@gitroom/frontend/lib/utils';

/**
 * Loading placeholder. A flat block at low opacity — no shimmer sweep, which
 * DESIGN.md §8 bans along with every other decorative loop.
 */
export function Skeleton({ className }: { className?: string }) {
  return (
    <div
      aria-hidden="true"
      className={cn('rounded-md bg-white/[0.06]', className)}
    />
  );
}
