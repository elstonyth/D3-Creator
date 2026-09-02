'use client';

/**
 * A password input with a show/hide toggle, shared by sign-up, sign-in and the
 * password reset. Four call sites, one control — a typo the user cannot see is
 * the single most common reason a correct password is rejected.
 *
 * The toggle is a `<button type="button">`: inside a form, a bare `<button>`
 * defaults to `type="submit"` and would submit the form on every reveal.
 */

import { EyeIcon, EyeOffIcon } from 'lucide-react';
import { useId, useState, type ReactElement } from 'react';

import { Input } from '@gitroom/frontend/components/ui/input';

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
}: PasswordFieldProps): ReactElement {
  const [shown, setShown] = useState(false);
  const hintId = useId();

  return (
    <label className="block space-y-1.5">
      <span className="text-label text-fg-muted">{label}</span>
      <div className="relative">
        <Input
          type={shown ? 'text' : 'password'}
          required
          minLength={minLength}
          maxLength={200}
          autoComplete={autoComplete}
          placeholder={placeholder}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled}
          aria-describedby={hint ? hintId : undefined}
          className="pr-11"
        />
        <button
          type="button"
          onClick={() => setShown((v) => !v)}
          disabled={disabled}
          aria-label={shown ? 'Hide password' : 'Show password'}
          aria-pressed={shown}
          className="absolute right-3 top-1/2 -translate-y-1/2 text-fg-subtle hover:text-fg transition-colors duration-150 ease-out disabled:opacity-50"
        >
          {shown ? (
            <EyeOffIcon className="size-4" aria-hidden />
          ) : (
            <EyeIcon className="size-4" aria-hidden />
          )}
        </button>
      </div>
      {hint ? (
        <span id={hintId} className="block text-caption text-fg-subtle">
          {hint}
        </span>
      ) : null}
    </label>
  );
}
