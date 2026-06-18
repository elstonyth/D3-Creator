// apps/frontend/src/app/(creator)/me/connections/meta-picker.tsx
'use client';

import { useActionState } from 'react';
import { finalizeMeta, type ActionResult } from './actions';

export interface MetaTargetView {
  pageId: string;
  pageName: string;
  igUsername: string | null;
}

export function MetaPicker({ targets }: { targets: MetaTargetView[] }) {
  const [state, action, pending] = useActionState<
    ActionResult | null,
    FormData
  >(finalizeMeta, null);
  return (
    <form
      action={action}
      className="glass-subtle border border-borderGlass rounded-2xl p-6 flex flex-col gap-4"
    >
      <div>
        <h2 className="text-heading text-fg">Choose accounts to connect</h2>
        <p className="text-body text-fgMuted mt-1">
          Tick the Pages / Instagram accounts you want D3 to read insights for.
        </p>
      </div>
      <ul className="flex flex-col gap-2">
        {targets.map((t) => (
          <li key={t.pageId} className="flex items-center gap-3">
            <input
              type="checkbox"
              name="pageId"
              value={t.pageId}
              defaultChecked
              id={`pg-${t.pageId}`}
            />
            <label htmlFor={`pg-${t.pageId}`} className="text-body text-fg">
              {t.pageName}
              {t.igUsername ? (
                <span className="text-caption text-fgSubtle">
                  {' '}
                  · IG @{t.igUsername}
                </span>
              ) : null}
            </label>
          </li>
        ))}
      </ul>
      <button
        type="submit"
        disabled={pending}
        className="self-start glass-base border border-borderGlass rounded-xl px-4 py-2 text-body text-fg hover:border-aurora-cta disabled:opacity-60"
      >
        {pending ? 'Connecting…' : 'Connect selected'}
      </button>
      {state ? (
        <p
          className={`text-caption ${state.ok ? 'text-aurora-cta' : 'text-red-400'}`}
        >
          {state.message}
        </p>
      ) : null}
    </form>
  );
}
