'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { setUserRole } from './actions';
import { Select } from '@gitroom/frontend/components/ui/input';
import { Alert } from '@gitroom/frontend/components/ui/alert';
import { EmptyState } from '@gitroom/frontend/components/ui/empty-state';
import {
  Table,
  TableWrap,
  Td,
  Th,
  Tr,
} from '@gitroom/frontend/components/ui/table';

interface Row {
  user_id: string;
  role: string;
  created_at: string;
  email: string;
}
// Value is the database slug; the label matches the legend above the table,
// which spells them with a capital.
const ROLES: [value: string, label: string][] = [
  ['admin', 'Admin'],
  ['creator', 'Creator'],
  ['member', 'Member'],
  ['none', 'None'],
];

// Module scope, and an explicit locale: a client component that formats with
// the browser's locale renders a different string than the server did and
// hydration mismatches. ISO-ish is also unambiguous for an operator.
const JOINED = new Intl.DateTimeFormat('en-CA', {
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

function formatJoined(iso: string): string {
  const t = Date.parse(iso);
  return Number.isNaN(t) ? 'Unknown' : JOINED.format(t);
}

export function RoleTable({ rows, selfId }: { rows: Row[]; selfId: string }) {
  const router = useRouter();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);

  async function change(
    userId: string,
    role: string,
    select: HTMLSelectElement,
    prevRole: string
  ) {
    setMsg(null);
    setPendingId(userId);
    try {
      const res = await setUserRole(userId, role);
      setMsg({ ok: res.ok, text: res.message });
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
      setMsg({
        ok: false,
        text: e instanceof Error ? e.message : 'Unexpected error',
      });
      select.value = prevRole;
    } finally {
      setPendingId(null);
    }
  }

  if (rows.length === 0) {
    return (
      <EmptyState
        size="sm"
        title="No accounts yet"
        description="Roles appear here once someone signs up or is provisioned."
        action={{ href: '/admin', label: 'Provision a creator' }}
      />
    );
  }

  return (
    <div className="space-y-3">
      {msg && <Alert tone={msg.ok ? 'success' : 'danger'}>{msg.text}</Alert>}
      <TableWrap>
        <Table className="min-w-[520px]">
          <caption className="sr-only">
            Every signed-in account, when it was created, and the role it holds
          </caption>
          <thead>
            <tr>
              <Th>Email</Th>
              <Th className="w-32">Joined</Th>
              <Th className="w-44">Role</Th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const isSelf = r.user_id === selfId;
              return (
                <Tr key={r.user_id}>
                  <Td>
                    <span className="break-all">{r.email}</span>
                    {isSelf && (
                      <span className="ml-2 text-caption text-fg-subtle">
                        you
                      </span>
                    )}
                  </Td>
                  <Td className="tnum text-fg-muted">
                    {formatJoined(r.created_at)}
                  </Td>
                  <Td>
                    <label htmlFor={`role-${r.user_id}`} className="sr-only">
                      Role for {r.email}
                    </label>
                    <Select
                      id={`role-${r.user_id}`}
                      defaultValue={r.role}
                      disabled={isSelf || pendingId === r.user_id}
                      onChange={(e) =>
                        change(r.user_id, e.target.value, e.target, r.role)
                      }
                    >
                      {ROLES.map(([value, label]) => (
                        <option key={value} value={value}>
                          {label}
                        </option>
                      ))}
                    </Select>
                    {isSelf && (
                      <p className="mt-1.5 text-caption text-fg-subtle">
                        You cannot change your own role.
                      </p>
                    )}
                  </Td>
                </Tr>
              );
            })}
          </tbody>
        </Table>
      </TableWrap>
    </div>
  );
}
