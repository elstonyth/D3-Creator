'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { setUserRole } from './actions';

interface Row {
  user_id: string;
  role: string;
  created_at: string;
  email: string;
}
const ROLES = ['admin', 'creator', 'member', 'none'];

export function RoleTable({ rows, selfId }: { rows: Row[]; selfId: string }) {
  const router = useRouter();
  const [msg, setMsg] = useState<string | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);

  async function change(
    userId: string,
    role: string,
    select: HTMLSelectElement,
    prevRole: string,
  ) {
    setMsg(null);
    setPendingId(userId);
    try {
      const res = await setUserRole(userId, role);
      setMsg(res.message);
      if (res.ok) {
        router.refresh();
      } else {
        // Roll the dropdown back to the persisted value so the screen never shows
        // a role the database rejected.
        select.value = prevRole;
      }
    } catch (e) {
      // Transport-level failure (network/timeout/aborted nav) — setUserRole
      // never returned, so roll back and surface it instead of leaving the row
      // stuck disabled.
      setMsg(e instanceof Error ? e.message : 'Unexpected error');
      select.value = prevRole;
    } finally {
      setPendingId(null);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      {msg && (
        <p className="text-caption text-aurora-cta" role="status">
          {msg}
        </p>
      )}
      <div className="glass-elevated rounded-2xl overflow-hidden">
        <table className="w-full text-label">
          <thead className="text-caption text-fgMuted border-b border-borderGlass">
            <tr>
              <th className="text-left p-4">Email</th>
              <th className="text-left p-4">Joined</th>
              <th className="text-left p-4">Role</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.user_id} className="border-b border-borderGlass/50">
                <td className="p-4 text-fg">{r.email}</td>
                <td className="p-4 text-fgMuted">
                  {new Date(r.created_at).toLocaleDateString()}
                </td>
                <td className="p-4">
                  <select
                    defaultValue={r.role}
                    disabled={r.user_id === selfId || pendingId === r.user_id}
                    onChange={(e) =>
                      change(r.user_id, e.target.value, e.target, r.role)
                    }
                    className="bg-canvas border border-borderGlass rounded-md px-2 py-1 text-fg disabled:opacity-50"
                  >
                    {ROLES.map((role) => (
                      <option key={role} value={role}>
                        {role}
                      </option>
                    ))}
                  </select>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
