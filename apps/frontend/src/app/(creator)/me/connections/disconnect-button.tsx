// apps/frontend/src/app/(creator)/me/connections/disconnect-button.tsx
'use client';

import { useActionState } from 'react';
import { disconnect, type ActionResult } from './actions';

export function DisconnectButton({ connectionId }: { connectionId: string }) {
  const [, action, pending] = useActionState<ActionResult | null, FormData>(
    disconnect,
    null,
  );
  return (
    <form action={action}>
      <input type="hidden" name="connection_id" value={connectionId} />
      <button
        type="submit"
        disabled={pending}
        className="text-caption text-fgMuted hover:text-red-400 disabled:opacity-60"
      >
        {pending ? '…' : 'Disconnect'}
      </button>
    </form>
  );
}
