'use client';

/**
 * Admin "create creator" form. Credentials group + a dynamic list of social
 * profile URLs (add/remove rows). Submits via the createCreator server action
 * (useActionState); renders per-URL results + a once-only credentials panel.
 *
 * Yellow-mono: success/failure read from a glyph + label, not color.
 */

import { useActionState, useRef, useState } from 'react';
import { Button } from '@gitroom/frontend/components/ui/button';
import { Input } from '@gitroom/frontend/components/ui/input';
import { createCreator, type ProvisionResult } from './actions';

function CheckGlyph() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden className="text-fg shrink-0">
      <path d="M20 6L9 17l-5-5" />
    </svg>
  );
}
function XGlyph() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden className="text-fgMuted shrink-0">
      <path d="M18 6L6 18M6 6l12 12" />
    </svg>
  );
}

export function ProvisionForm() {
  const [state, action, pending] = useActionState<ProvisionResult | null, FormData>(
    createCreator,
    null,
  );
  const rowSeq = useRef(1);
  const nextRowId = () => (rowSeq.current += 1);
  const [rows, setRows] = useState<{ id: number; value: string }[]>(() => [
    { id: 1, value: '' },
  ]);

  function updateRow(id: number, value: string) {
    setRows((r) => r.map((row) => (row.id === id ? { ...row, value } : row)));
  }
  function addRow() {
    setRows((r) => [...r, { id: nextRowId(), value: '' }]);
  }
  function removeRow(id: number) {
    setRows((r) => (r.length === 1 ? r : r.filter((row) => row.id !== id)));
  }

  return (
    <form action={action} className="flex flex-col gap-5">
      {/* Credentials */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <label className="block space-y-1.5">
          <span className="text-label text-fgMuted">Display name</span>
          <Input name="display_name" type="text" required placeholder="Creator name" />
        </label>
        <label className="block space-y-1.5">
          <span className="text-label text-fgMuted">Email</span>
          <Input name="email" type="email" required placeholder="creator@example.com" />
        </label>
        <label className="block space-y-1.5">
          <span className="text-label text-fgMuted">Password</span>
          <Input name="password" type="text" required minLength={8} placeholder="At least 8 characters" />
        </label>
      </div>

      {/* Social URLs */}
      <div className="flex flex-col gap-2 border-t border-borderGlass pt-4">
        <span className="text-label text-fgMuted">Social profile URLs</span>
        {rows.map((row) => (
          <div key={row.id} className="flex items-center gap-2">
            <Input
              name="url"
              type="url"
              value={row.value}
              onChange={(e) => updateRow(row.id, e.target.value)}
              placeholder="https://www.instagram.com/handle"
              className="flex-1"
            />
            <button
              type="button"
              onClick={() => removeRow(row.id)}
              className="shrink-0 size-9 inline-flex items-center justify-center rounded-md text-fgMuted hover:bg-white/[0.04] border border-white/10"
              aria-label="Remove URL"
            >
              <XGlyph />
            </button>
          </div>
        ))}
        <button
          type="button"
          onClick={addRow}
          className="self-start text-label text-fgMuted hover:text-fg px-2 py-1"
        >
          + Add URL
        </button>
      </div>

      {/* Submit */}
      <div className="flex justify-end">
        <Button type="submit" size="lg" disabled={pending}>
          {pending ? 'Creating…' : 'Create creator'}
        </Button>
      </div>

      {/* Error */}
      {state && !state.ok && (
        <p className="text-caption text-fg flex items-center gap-1.5" role="alert">
          <XGlyph /> {state.message}
        </p>
      )}

      {/* Success: credentials echo + per-URL results */}
      {state?.ok && (
        <div className="flex flex-col gap-4">
          <p className="text-caption text-fgMuted">{state.message}</p>
          {state.credentials && (
            <CredentialsPanel email={state.credentials.email} password={state.credentials.password} />
          )}
          {state.urlResults && state.urlResults.length > 0 && (
            <ul className="flex flex-col gap-1.5">
              {state.urlResults.map((r) => (
                <li key={r.url} className="flex items-center gap-2 text-caption min-w-0">
                  {r.status === 'failed' ? <XGlyph /> : <CheckGlyph />}
                  <span className="text-fgMuted truncate">
                    {r.platform ? `${r.platform} · ` : ''}
                    {r.url}
                  </span>
                  {r.detail && <span className="text-fgSubtle shrink-0">— {r.detail}</span>}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </form>
  );
}

function CredentialsPanel({ email, password }: { email: string; password: string }) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    await navigator.clipboard.writeText(`${email}\n${password}`);
    setCopied(true);
  }
  return (
    <div className="glass-elevated rounded-xl border border-borderGlass p-4 flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <span className="text-label text-fgMuted">Login credentials</span>
        <button type="button" onClick={copy} className="text-label text-aurora-cta hover:underline">
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
      <div className="font-mono text-body-sm text-fg break-all">{email}</div>
      <div className="font-mono text-body-sm text-fg break-all">{password}</div>
      <span className="text-caption text-fgSubtle">
        Shown once — copy and share securely now.
      </span>
    </div>
  );
}
