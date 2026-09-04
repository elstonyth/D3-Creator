import * as React from 'react';
import { cn } from '@gitroom/frontend/lib/utils';

/**
 * Page gutter. Every full-bleed band puts its content inside one of these so
 * the left edge of a heading lines up across the whole site.
 */
export function Container({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn('mx-auto w-full max-w-content px-6 md:px-8', className)}
      {...props}
    />
  );
}

const SPACE = {
  sm: 'py-10 sm:py-12',
  md: 'py-14 sm:py-20',
  lg: 'py-20 sm:py-28',
} as const;

interface SectionProps extends React.HTMLAttributes<HTMLElement> {
  space?: keyof typeof SPACE;
  /** Hairline rule across the top — the only section divider we use. */
  divided?: boolean;
}

export function Section({
  space = 'md',
  divided = false,
  className,
  ...props
}: SectionProps) {
  return (
    <section
      className={cn(
        SPACE[space],
        divided && 'border-t border-line-subtle',
        className,
      )}
      {...props}
    />
  );
}

interface SectionHeaderProps {
  /** Small uppercase kicker. Optional — most sections do not need one. */
  eyebrow?: string;
  title: React.ReactNode;
  lede?: React.ReactNode;
  /** Right-aligned action, e.g. a "See all →" link. */
  action?: React.ReactNode;
  align?: 'start' | 'center';
  className?: string;
}

export function SectionHeader({
  eyebrow,
  title,
  lede,
  action,
  align = 'start',
  className,
}: SectionHeaderProps) {
  return (
    <div
      className={cn(
        'mb-8 flex flex-col gap-4 sm:mb-10 sm:flex-row sm:items-end sm:justify-between',
        align === 'center' && 'sm:flex-col sm:items-center sm:text-center',
        className,
      )}
    >
      <div className={cn('max-w-prose', align === 'center' && 'mx-auto')}>
        {eyebrow ? (
          <p className="mb-3 text-micro uppercase text-fg-subtle">{eyebrow}</p>
        ) : null}
        <h2 className="text-section text-fg">{title}</h2>
        {lede ? <p className="mt-3 text-body text-fg-muted">{lede}</p> : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}
