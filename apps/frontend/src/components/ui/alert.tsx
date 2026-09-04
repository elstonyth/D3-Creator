import * as React from 'react';
import { cn } from '@gitroom/frontend/lib/utils';

type AlertTone = 'info' | 'success' | 'warning' | 'danger';

// Yellow-mono (DESIGN.md §2): the tone changes the ICON and the intensity, not
// the hue. An alert must still read correctly in greyscale, so the icon and the
// wording carry the meaning.
const ICON: Record<AlertTone, React.ReactNode> = {
  info: (
    <>
      <circle cx="8" cy="8" r="6.75" />
      <path d="M8 7.25v4M8 4.75v.5" strokeLinecap="round" />
    </>
  ),
  success: (
    <>
      <circle cx="8" cy="8" r="6.75" />
      <path d="m5.25 8.25 1.9 1.9 3.6-3.9" strokeLinecap="round" strokeLinejoin="round" />
    </>
  ),
  warning: (
    <>
      <path d="M8 2.4 14.4 13.4H1.6z" strokeLinejoin="round" />
      <path d="M8 6.6v3.1M8 11.7v.4" strokeLinecap="round" />
    </>
  ),
  danger: (
    <>
      <circle cx="8" cy="8" r="6.75" />
      <path d="m5.9 5.9 4.2 4.2M10.1 5.9l-4.2 4.2" strokeLinecap="round" />
    </>
  ),
};

const TONE: Record<AlertTone, string> = {
  info: 'border-line bg-surface-subtle text-fg-muted [&_svg]:text-fg-subtle',
  success: 'border-brand/25 bg-brand/[0.06] text-fg-muted [&_svg]:text-brand',
  warning: 'border-brand/25 bg-brand/[0.06] text-fg-muted [&_svg]:text-brand-300',
  danger: 'border-brand-800/60 bg-danger/40 text-danger-fg [&_svg]:text-brand-200',
};

interface AlertProps
  extends Omit<React.HTMLAttributes<HTMLDivElement>, 'title'> {
  tone?: AlertTone;
  title?: React.ReactNode;
}

export function Alert({
  tone = 'info',
  title,
  className,
  children,
  ...props
}: AlertProps) {
  return (
    <div
      role={tone === 'danger' ? 'alert' : 'status'}
      className={cn(
        'flex gap-3 rounded-xl border p-4 text-body-sm',
        TONE[tone],
        className,
      )}
      {...props}
    >
      <svg
        viewBox="0 0 16 16"
        aria-hidden="true"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.4"
        className="mt-0.5 h-4 w-4 shrink-0"
      >
        {ICON[tone]}
      </svg>
      <div className="min-w-0 space-y-1">
        {title ? <p className="font-medium text-fg">{title}</p> : null}
        {children ? <div className="[&_a]:underline [&_a]:underline-offset-4">{children}</div> : null}
      </div>
    </div>
  );
}
