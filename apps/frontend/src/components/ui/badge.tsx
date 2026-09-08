import * as React from 'react';
import { cn } from '@gitroom/frontend/lib/utils';

type BadgeTone = 'neutral' | 'brand' | 'muted';

// Neutral by default. Yellow only where the ledger allows it — an active state
// or a live data point, never as decoration on a static label.
const TONE: Record<BadgeTone, string> = {
  neutral: 'bg-white/[0.06] text-fg',
  brand: 'bg-brand/10 text-brand-200 border border-brand/25',
  muted: 'bg-white/[0.04] text-fg-subtle',
};

interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  tone?: BadgeTone;
}

export function Badge({ tone = 'neutral', className, ...props }: BadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-caption leading-none',
        TONE[tone],
        className,
      )}
      {...props}
    />
  );
}

/** Live-data marker: a dot plus a word. The dot alone would carry no meaning. */
export function LiveBadge({ children = 'Live' }: { children?: React.ReactNode }) {
  return (
    <Badge tone="muted" className="uppercase tracking-[0.08em]">
      <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-brand" />
      {children}
    </Badge>
  );
}
