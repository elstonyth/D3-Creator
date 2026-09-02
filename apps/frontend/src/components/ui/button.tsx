import * as React from 'react';
import Link from 'next/link';
import { cn } from '@gitroom/frontend/lib/utils';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
export type ButtonSize = 'sm' | 'md' | 'lg';

// DESIGN.md §1 yellow ledger: exactly ONE solid-yellow button per screen. Every
// other action is `secondary` (hairline) or `ghost` (bare). If a screen needs
// two yellow buttons, the screen has two primary actions and that is the bug.
const VARIANT: Record<ButtonVariant, string> = {
  primary:
    'bg-brand text-fg-on-brand hover:bg-brand-300 active:bg-brand-600 font-medium',
  secondary:
    'border border-line-strong text-fg hover:bg-white/[0.05] active:bg-white/[0.08]',
  ghost: 'text-fg-muted hover:text-fg hover:bg-white/[0.05]',
  // Yellow-mono: destructive reads as dark-yellow ground + pale-yellow text.
  // Callers must also supply the word ("Delete") — never colour alone.
  danger:
    'bg-danger text-danger-fg hover:bg-brand-800 hover:text-fg-on-brand font-medium',
};

const SIZE: Record<ButtonSize, string> = {
  sm: 'h-8 px-3 text-caption gap-1.5',
  md: 'h-9 px-4 text-label gap-2',
  lg: 'h-11 px-5 text-body gap-2',
};

const BASE = cn(
  'relative inline-flex items-center justify-center whitespace-nowrap rounded-lg select-none',
  'transition-[background-color,border-color,color,opacity,transform] duration-150 ease-out',
  'focus-visible:outline-none focus-visible:shadow-focus',
  'active:scale-[0.985] motion-reduce:active:scale-100',
  'disabled:opacity-45 disabled:pointer-events-none aria-disabled:opacity-45 aria-disabled:pointer-events-none',
);

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** Swaps the label for a spinner and blocks the click. */
  loading?: boolean;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  function Button(
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
  ) {
    return (
      <button
        ref={ref}
        type={type}
        disabled={disabled || loading}
        aria-busy={loading || undefined}
        className={cn(BASE, VARIANT[variant], SIZE[size], className)}
        {...props}
      >
        {/* The label keeps its box while loading, so the button never resizes
            mid-submit and the row below it never jumps. */}
        <span className={cn('contents', loading && 'invisible')}>
          {children}
        </span>
        {loading ? <Spinner className="absolute" /> : null}
      </button>
    );
  },
);

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
      className={cn(BASE, VARIANT[variant], SIZE[size], className)}
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
