import * as React from 'react';
import Link from 'next/link';
import { cn } from '@gitroom/frontend/lib/utils';

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'outline' | 'danger';
type ButtonSize = 'sm' | 'md' | 'lg';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** Swaps the label for a spinner and blocks the click. */
  loading?: boolean;
}

const base =
  'inline-flex items-center justify-center gap-2 rounded-md font-medium text-label whitespace-nowrap select-none ' +
  'transition-colors duration-150 ease-out ' +
  'focus-visible:outline-none focus-visible:shadow-focusRing ' +
  'disabled:opacity-50 disabled:pointer-events-none';

const variantStyles: Record<ButtonVariant, string> = {
  primary:
    'bg-aurora-cta text-brand-darker hover:bg-aurora-ctaHover',
  secondary:
    'glass-elevated text-fg hover:bg-white/[0.06]',
  ghost:
    'bg-transparent text-fgMuted hover:text-fg hover:bg-white/[0.04]',
  outline:
    'border border-borderGlassStrong text-fg hover:bg-white/[0.04]',
  danger:
    'bg-brand-900 text-brand-200 hover:bg-brand-800 hover:text-fg font-medium',
};

const sizeStyles: Record<ButtonSize, string> = {
  sm: 'h-8 px-3 text-caption',
  md: 'h-10 px-4',
  lg: 'h-11 px-5',
};

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      className,
      variant = 'primary',
      size = 'md',
      type = 'button',
      loading = false,
      disabled,
      children,
      ...props
    },
    ref,
  ) => (
    <button
      ref={ref}
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={cn(
        base,
        'relative',
        variantStyles[variant],
        sizeStyles[size],
        className,
      )}
      {...props}
    >
      {/* The label keeps its box while loading, so the button never resizes
          mid-submit and the row below it never jumps. */}
      <span className={cn('contents', loading && 'invisible')}>{children}</span>
      {loading ? <Spinner className="absolute" /> : null}
    </button>
  ),
);
Button.displayName = 'Button';

interface ButtonLinkProps
  extends Omit<React.ComponentProps<typeof Link>, 'className'> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  className?: string;
}

/**
 * A link that looks like a button. Nesting an <a> inside a <button> is invalid
 * markup and breaks keyboard activation, so navigation never uses <Button>.
 */
export function ButtonLink({
  variant = 'primary',
  size = 'md',
  className,
  ...props
}: ButtonLinkProps) {
  return (
    <Link
      className={cn(base, variantStyles[variant], sizeStyles[size], className)}
      {...props}
    />
  );
}

export function Spinner({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 16 16"
      aria-hidden="true"
      className={cn('h-4 w-4 animate-spin', className)}
    >
      <circle
        cx="8"
        cy="8"
        r="6.5"
        fill="none"
        stroke="currentColor"
        strokeOpacity="0.25"
        strokeWidth="2"
      />
      <path
        d="M8 1.5a6.5 6.5 0 0 1 6.5 6.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}
