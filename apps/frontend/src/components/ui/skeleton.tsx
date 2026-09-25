import { cn } from '@gitroom/frontend/lib/utils';

/**
 * Loading placeholder. A flat block at low opacity — no shimmer sweep: that is
 * an animated gradient, which DESIGN.md §5 bans.
 */
export function Skeleton({ className }: { className?: string }) {
  return (
    <div
      aria-hidden="true"
      className={cn('rounded-md bg-white/[0.06]', className)}
    />
  );
}
