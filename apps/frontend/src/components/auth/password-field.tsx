'use client';

/**
 * A password input with a show/hide toggle, shared by sign-up, sign-in and the
 * password reset. Four call sites, one control — a typo the user cannot see is
 * the single most common reason a correct password is rejected.
 *
 * The toggle is a `<button type="button">`: inside a form, a bare `<button>`
 * defaults to `type="submit"` and would submit the form on every reveal. It
 * fills the 44px gutter the input reserves with `pr-11`, so it is a real tap
 * target rather than a 16px icon, and it takes the same focus ring as
 * everything else.
 */

import { useId, useState, type ReactElement, type ReactNode } from 'react';

import { Field, Input } from '@gitroom/frontend/components/ui/input';

interface PasswordFieldProps {
  label: string;
  value: string;
  onChange: (next: string) => void;
  /** `new-password` on sign-up and reset, `current-password` on sign-in. */
  autoComplete: 'new-password' | 'current-password';
  placeholder?: string;
  minLength?: number;
  disabled?: boolean;
  /** Rendered under the field, e.g. the strength hint on a new password. */
  hint?: string;
  /** Rendered beside the label, e.g. the "Forgot password?" link. */
  aside?: ReactNode;
}

export function PasswordField({
  label,
  value,
  onChange,
  autoComplete,
  placeholder,
  minLength,
  disabled = false,
  hint,
  aside,
}: PasswordFieldProps): ReactElement {
  const [shown, setShown] = useState(false);
  const id = useId();

  return (
    <Field label={label} htmlFor={id} hint={hint} aside={aside}>
      <div className="relative">
        <Input
          id={id}
          type={shown ? 'text' : 'password'}
          required
          minLength={minLength}
          maxLength={200}
          autoComplete={autoComplete}
          placeholder={placeholder}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled}
          aria-describedby={hint ? `${id}-hint` : undefined}
          className="pr-11"
        />
        <button
          type="button"
          onClick={() => setShown((v) => !v)}
          disabled={disabled}
          aria-label={shown ? 'Hide password' : 'Show password'}
          aria-pressed={shown}
          className="absolute inset-y-0 right-0 flex w-11 items-center justify-center rounded-r-lg text-fg-subtle transition-colors duration-150 ease-out hover:text-fg focus-visible:outline-none focus-visible:shadow-focus disabled:pointer-events-none disabled:opacity-50"
        >
          <svg
            viewBox="0 0 16 16"
            aria-hidden="true"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.4"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="h-4 w-4"
          >
            <path d="M1.4 8S3.9 3.6 8 3.6 14.6 8 14.6 8 12.1 12.4 8 12.4 1.4 8 1.4 8Z" />
            <circle cx="8" cy="8" r="1.9" />
            {shown ? <path d="m2.6 13.4 10.8-10.8" /> : null}
          </svg>
        </button>
      </div>
    </Field>
  );
}
