import * as React from 'react';
import { cn } from '@gitroom/frontend/lib/utils';

interface StatProps {
  label: string;
  value: React.ReactNode;
  /** One line under the number: what it counts, or over what window. */
  meta?: React.ReactNode;
  size?: 'md' | 'lg';
  className?: string;
}

/**
 * A single metric readout: label above, number below, caption under it.
 *
 * The number carries `.tnum` (tabular lining figures) so a column of these
 * stays optically aligned and does not reflow as digits change width — which
 * matters on a page whose whole job is showing counts that tick over.
 */
export function Stat({
  label,
  value,
  meta,
  size = 'md',
  className,
}: StatProps) {
  return (
    <div className={cn('min-w-0', className)}>
      <p className="text-micro uppercase text-fg-subtle">{label}</p>
      <p
        className={cn(
          'tnum mt-2 text-fg',
          size === 'lg' ? 'text-metric-lg' : 'text-metric',
        )}
      >
        {value}
      </p>
      {meta ? (
        <p className="mt-1.5 text-caption text-fg-subtle">{meta}</p>
      ) : null}
    </div>
  );
}

/**
 * Equal-width stat row. Hairlines between cells rather than boxes around them —
 * a row of four bordered cards reads as four unrelated things.
 */
export function StatRow({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        'grid gap-px overflow-hidden rounded-2xl border border-line bg-line',
        'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3',
        className,
      )}
    >
      {React.Children.map(children, (child) => (
        <div className="bg-surface p-5 sm:p-6">{child}</div>
      ))}
    </div>
  );
}
