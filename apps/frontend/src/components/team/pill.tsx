import type { ReactNode } from 'react';

/**
 * A small status pill for the team screens. It is ui/badge.tsx's look, but
 * with plain class strings: Badge runs its classes through cn(), and
 * tailwind-merge reads `text-caption` as a colour and drops it next to the
 * tone's `text-fg`, so a Badge renders at whatever size surrounds it.
 */
export function Pill({
  tone = 'neutral',
  className = '',
  children,
}: {
  tone?: 'neutral' | 'muted';
  className?: string;
  children: ReactNode;
}) {
  const colours =
    tone === 'muted'
      ? 'bg-white/[0.04] text-fg-subtle'
      : 'bg-white/[0.06] text-fg';
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-caption leading-none ${colours} ${className}`}
    >
      {children}
    </span>
  );
}
