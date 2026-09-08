'use client';

import * as React from 'react';
import { cn } from '@gitroom/frontend/lib/utils';

const CONTROL = cn(
  'w-full rounded-lg bg-surface-subtle border border-line px-3 text-body text-fg',
  'placeholder:text-fg-subtle',
  'transition-[border-color,box-shadow] duration-150 ease-out',
  'hover:border-line-strong',
  'focus:outline-none focus:border-brand focus:shadow-focus',
  'disabled:opacity-50 disabled:pointer-events-none',
  // Chrome paints autofilled inputs a hard blue. There is no property to
  // restyle the fill, so the standard trick is an inset shadow the size of the
  // field plus a text-fill colour.
  '[&:-webkit-autofill]:[-webkit-text-fill-color:var(--fg)]',
  '[&:-webkit-autofill]:[box-shadow:0_0_0_1000px_var(--surface-subtle)_inset]',
);

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  invalid?: boolean;
}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  function Input({ className, type = 'text', invalid, ...props }, ref) {
    return (
      <input
        ref={ref}
        type={type}
        aria-invalid={invalid || undefined}
        className={cn(
          CONTROL,
          'h-10',
          invalid && 'border-brand-700 focus:border-brand-700',
          className,
        )}
        {...props}
      />
    );
  },
);

export const Textarea = React.forwardRef<
  HTMLTextAreaElement,
  React.TextareaHTMLAttributes<HTMLTextAreaElement>
>(function Textarea({ className, rows = 4, ...props }, ref) {
  return (
    <textarea
      ref={ref}
      rows={rows}
      className={cn(CONTROL, 'py-2.5 resize-y', className)}
      {...props}
    />
  );
});

export const Select = React.forwardRef<
  HTMLSelectElement,
  React.SelectHTMLAttributes<HTMLSelectElement>
>(function Select({ className, children, ...props }, ref) {
  return (
    <div className="relative">
      <select
        ref={ref}
        className={cn(CONTROL, 'h-10 appearance-none pr-9', className)}
        {...props}
      >
        {children}
      </select>
      <svg
        aria-hidden="true"
        viewBox="0 0 12 12"
        className="pointer-events-none absolute right-3 top-1/2 h-3 w-3 -translate-y-1/2 text-fg-subtle"
      >
        <path
          d="M2.5 4.5 6 8l3.5-3.5"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </div>
  );
});

interface FieldProps {
  label: string;
  htmlFor: string;
  /** Always-visible helper text, above the control's error. */
  hint?: React.ReactNode;
  error?: React.ReactNode;
  /** Rendered next to the label, e.g. a "Forgot password?" link. */
  aside?: React.ReactNode;
  optional?: boolean;
  children: React.ReactNode;
}

/**
 * Label + control + message, wired for screen readers.
 *
 * The message slot is the reason this exists: an error that appears below a
 * field pushes the whole form down, so the slot reserves its line whenever a
 * hint is present and only collapses on fields that have neither.
 */
export function Field({
  label,
  htmlFor,
  hint,
  error,
  aside,
  optional = false,
  children,
}: FieldProps) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-baseline justify-between gap-3">
        <label htmlFor={htmlFor} className="text-label text-fg">
          {label}
          {optional ? (
            <span className="ml-1.5 text-caption font-normal text-fg-subtle">
              optional
            </span>
          ) : null}
        </label>
        {aside}
      </div>
      {children}
      {error ? (
        <p id={`${htmlFor}-error`} role="alert" className="text-caption text-brand-200">
          {error}
        </p>
      ) : hint ? (
        <p id={`${htmlFor}-hint`} className="text-caption text-fg-subtle">
          {hint}
        </p>
      ) : null}
    </div>
  );
}
