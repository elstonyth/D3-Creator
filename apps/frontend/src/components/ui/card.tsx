import * as React from 'react';
import { cn } from '@gitroom/frontend/lib/utils';

type CardTone = 'default' | 'subtle' | 'elevated';

const TONE: Record<CardTone, string> = {
  default: 'bg-surface border-line',
  subtle: 'bg-surface-subtle border-line-subtle',
  elevated: 'bg-surface-elevated border-line-strong shadow',
};

const PAD = {
  none: '',
  sm: 'p-4',
  md: 'p-5 sm:p-6',
  lg: 'p-6 sm:p-8',
} as const;

interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  tone?: CardTone;
  padding?: keyof typeof PAD;
  /** Border brightens on hover. Only for cards that are themselves a link. */
  interactive?: boolean;
}

/**
 * The one surface primitive. Flat fill, 1px hairline, 12px radius — depth comes
 * from the border, never from glow or blur (DESIGN.md §1).
 */
export function Card({
  tone = 'default',
  padding = 'md',
  interactive = false,
  className,
  ...props
}: CardProps) {
  return (
    <div
      className={cn(
        'rounded-2xl border',
        TONE[tone],
        PAD[padding],
        interactive &&
          'transition-colors duration-150 ease-out hover:border-line-strong',
        className,
      )}
      {...props}
    />
  );
}

export function CardHeader({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        'flex items-start justify-between gap-4 pb-4 mb-4 border-b border-line-subtle',
        className,
      )}
      {...props}
    />
  );
}

export function CardTitle({
  className,
  ...props
}: React.HTMLAttributes<HTMLHeadingElement>) {
  return <h3 className={cn('text-heading text-fg', className)} {...props} />;
}

export function CardDescription({
  className,
  ...props
}: React.HTMLAttributes<HTMLParagraphElement>) {
  return (
    <p className={cn('text-body-sm text-fg-muted', className)} {...props} />
  );
}
