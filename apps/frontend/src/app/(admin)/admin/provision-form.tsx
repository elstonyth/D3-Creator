'use client';

/**
 * Admin "create creator" form. Credentials group + a dynamic list of social
 * profile URLs (add/remove rows). Submits to the createCreator server action
 * inside a transition; renders per-URL results + a once-only credentials panel.
 * On success the form clears so it's ready for the next creator.
 *
 * Yellow-mono: every outcome reads from a glyph + a word, never colour alone.
 */

import { useId, useRef, useState, useTransition, type FormEvent } from 'react';
import { Button } from '@gitroom/frontend/components/ui/button';
import { Input, Field } from '@gitroom/frontend/components/ui/input';
import { Alert } from '@gitroom/frontend/components/ui/alert';
import { createCreator, type ProvisionResult } from './actions';

// Example URLs cycled across rows so the form reads as multi-platform, not
// Instagram-only. The actual platform is detected server-side from whatever is
// pasted (detectPlatform), so any supported host works regardless of which
// placeholder a given row shows. RedNote is archived/hidden, so it's omitted.
const URL_PLACEHOLDERS = [
  'https://www.instagram.com/handle',
  'https://www.tiktok.com/@handle',
  'https://www.facebook.com/handle',
  'https://www.douyin.com/user/MS4w...',
];

function CheckGlyph() {
  return (
    <svg
      width="13"
      height="13"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      className="mt-0.5 shrink-0 text-brand"
    >
      <path d="M20 6L9 17l-5-5" />
    </svg>
  );
}

function XGlyph({ className }: { className?: string }) {
  return (
    <svg
      width="13"
      height="13"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      className={className ?? 'mt-0.5 shrink-0 text-fg-subtle'}
    >
      <path d="M18 6L6 18M6 6l12 12" />
    </svg>
  );
}

export function ProvisionForm() {
  const fieldId = useId();
  const rowSeq = useRef(1);
  const nextRowId = () => (rowSeq.current += 1);
  const [rows, setRows] = useState<{ id: number; value: string }[]>(() => [
    { id: 1, value: '' },
  ]);
  const formRef = useRef<HTMLFormElement>(null);
  const [result, setResult] = useState<ProvisionResult | null>(null);
  const [pending, startTransition] = useTransition();

  // Submit via onSubmit (not the form `action` prop) so React does not
  // auto-reset the fields on a failed attempt. We reset explicitly, and only on
  // success: clear the inputs and collapse the URL list back to one empty row
  // so the filled-in values don't linger and eat space, leaving the form ready
  // for the next creator. The result panel still renders from `result`.
  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    startTransition(async () => {
      const res = await createCreator(null, formData);
      setResult(res);
      if (res.ok) {
        formRef.current?.reset();
        rowSeq.current = 1;
        setRows([{ id: 1, value: '' }]);
      }
    });
  }

  function updateRow(id: number, value: string) {
    setRows((r) => r.map((row) => (row.id === id ? { ...row, value } : row)));
  }
  function addRow() {
    setRows((r) => [...r, { id: nextRowId(), value: '' }]);
  }
  function removeRow(id: number) {
    setRows((r) => (r.length === 1 ? r : r.filter((row) => row.id !== id)));
  }

  const onlyRow = rows.length === 1;

  return (
    <form ref={formRef} onSubmit={handleSubmit} className="space-y-6">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Field label="Display name" htmlFor={`${fieldId}-name`}>
          <Input
            id={`${fieldId}-name`}
            name="display_name"
            type="text"
            required
            maxLength={80}
            autoComplete="off"
            placeholder="Creator name"
          />
        </Field>
        <Field label="Email" htmlFor={`${fieldId}-email`}>
          <Input
            id={`${fieldId}-email`}
            name="email"
            type="email"
            required
            maxLength={254}
            autoComplete="off"
            placeholder="creator@example.com"
          />
        </Field>
        <Field
          label="Password"
          htmlFor={`${fieldId}-password`}
          hint="8 to 72 characters"
        >
          <Input
            id={`${fieldId}-password`}
            name="password"
            type="password"
            required
            aria-describedby={`${fieldId}-password-hint`}
            minLength={8}
            maxLength={72}
            autoComplete="new-password"
          />
        </Field>
      </div>

      <div className="space-y-3 border-t border-line-subtle pt-6">
        <div>
          <p className="text-label text-fg">Social profile URLs</p>
          <p className="mt-1 text-caption text-fg-subtle">
            Instagram, TikTok, Facebook or Douyin. The platform is detected from
            the URL — paste the profile page, not a post.
          </p>
        </div>

        <ul className="space-y-2">
          {rows.map((row, i) => {
            const id = `${fieldId}-url-${row.id}`;
            return (
              <li key={row.id} className="flex items-center gap-2">
                <label htmlFor={id} className="sr-only">
                  Profile URL {i + 1}
                </label>
                <Input
                  id={id}
                  name="url"
                  type="url"
                  value={row.value}
                  onChange={(e) => updateRow(row.id, e.target.value)}
                  placeholder={URL_PLACEHOLDERS[i % URL_PLACEHOLDERS.length]}
                  className="flex-1"
                />
                <button
                  type="button"
                  onClick={() => removeRow(row.id)}
                  disabled={onlyRow}
                  className="inline-flex size-10 shrink-0 items-center justify-center rounded-lg border border-line text-fg-muted transition-colors duration-150 ease-out hover:border-line-strong hover:text-fg focus-visible:outline-none focus-visible:shadow-focus disabled:pointer-events-none disabled:opacity-40"
                  aria-label={`Remove profile URL ${i + 1}`}
                >
                  <XGlyph className="shrink-0" />
                </button>
              </li>
            );
          })}
        </ul>

        <Button type="button" variant="secondary" size="sm" onClick={addRow}>
          Add another URL
        </Button>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line-subtle pt-6">
        <p className="text-caption text-fg-subtle">
          The creator can sign in immediately.
        </p>
        <Button type="submit" size="lg" loading={pending}>
          Create creator
        </Button>
      </div>

      {/* A failure still surfaces credentials on a PARTIAL failure (the auth
          user was created but a later step failed) so the admin doesn't lose
          a login that now exists and cannot be recovered. */}
      {result && !result.ok && (
        <div className="space-y-4">
          <Alert tone="danger" title="Creator not created">
            {result.message}
          </Alert>
          {result.credentials && (
            <CredentialsPanel
              title="Login was created before the failure"
              email={result.credentials.email}
              password={result.credentials.password}
            />
          )}
        </div>
      )}

      {result?.ok && (
        <div className="space-y-4">
          <Alert tone="success" title="Creator created">
            {result.message}
          </Alert>
          {result.credentials && (
            <CredentialsPanel
              title="Login credentials"
              email={result.credentials.email}
              password={result.credentials.password}
            />
          )}
          {result.urlResults && result.urlResults.length > 0 && (
            <ul className="space-y-1.5">
              {result.urlResults.map((r) => (
                <li
                  key={r.url}
                  className="flex min-w-0 items-start gap-2 text-caption"
                >
                  {r.status === 'failed' ? <XGlyph /> : <CheckGlyph />}
                  <span className="sr-only">
                    {r.status === 'failed' ? 'Failed:' : 'Added:'}
                  </span>
                  <span className="min-w-0 truncate text-fg-muted">
                    {r.platform ? `${r.platform} · ` : ''}
                    {r.url}
                  </span>
                  {r.detail && (
                    <span className="shrink-0 text-fg-subtle">
                      — {r.detail}
                    </span>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </form>
  );
}

function CredentialsPanel({
  title,
  email,
  password,
}: {
  title: string;
  email: string;
  password: string;
}) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(`${email}\n${password}`);
      setCopied(true);
    } catch {
      // Clipboard API unavailable (insecure context) or permission denied — the
      // credentials are visible on screen for manual copy, so just no-op.
      setCopied(false);
    }
  }
  return (
    <div className="rounded-2xl border border-line-strong bg-surface-elevated p-4 shadow">
      <div className="flex items-center justify-between gap-3">
        <p className="text-label text-fg">{title}</p>
        <Button type="button" variant="secondary" size="sm" onClick={copy}>
          {copied ? 'Copied' : 'Copy both'}
        </Button>
      </div>
      <dl className="mt-3 space-y-1.5 font-mono text-body-sm">
        <div className="flex gap-2">
          <dt className="w-20 shrink-0 font-sans text-caption text-fg-subtle">
            Email
          </dt>
          <dd className="min-w-0 break-all text-fg">{email}</dd>
        </div>
        <div className="flex gap-2">
          <dt className="w-20 shrink-0 font-sans text-caption text-fg-subtle">
            Password
          </dt>
          <dd className="min-w-0 break-all text-fg">{password}</dd>
        </div>
      </dl>
      <p className="mt-3 text-caption text-fg-subtle">
        Shown once. Leaving this page loses it — a reset is the only way back.
      </p>
    </div>
  );
}
