'use client';

import { localizeAdminError } from '../localize-error';
import { useI18n } from '@gitroom/frontend/components/i18n/locale-provider';
import { localeTag, type Locale } from '@gitroom/frontend/lib/i18n';
import { Fragment, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { setUserRole } from './actions';
import { Button } from '@gitroom/frontend/components/ui/button';
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
const label = (v: string) => ROLES.find(([x]) => x === v)?.[1] ?? v;

// Module scope, and an explicit locale: a client component that formats with
// the browser's locale renders a different string than the server did and
// hydration mismatches. ISO-ish is also unambiguous for an operator.
const joinedFormatter = (locale: Locale) =>
  new Intl.DateTimeFormat(locale === 'en' ? 'en-CA' : localeTag(locale), {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });

function formatJoined(iso: string, locale: Locale): string {
  const t = Date.parse(iso);
  return Number.isNaN(t) ? 'Unknown' : joinedFormatter(locale).format(t);
}

export function RoleTable({ rows, selfId }: { rows: Row[]; selfId: string }) {
  const { t, locale } = useI18n();
  const router = useRouter();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);
  // The role pick waiting for Save: nothing is written on change alone.
  const [ask, setAsk] = useState<{
    userId: string;
    email: string;
    from: string;
    to: string;
    select: HTMLSelectElement;
  } | null>(null);

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
        text: localizeAdminError(
          e instanceof Error ? e.message : 'Unexpected error',
          locale,
          t,
        ),
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
        title={t('No accounts yet')}
        description={t(
          'Roles appear here once someone signs up or is provisioned.',
        )}
        action={{ href: '/admin', label: t('Provision a creator') }}
      />
    );
  }

  return (
    <div className="space-y-3">
      {msg && <Alert tone={msg.ok ? 'success' : 'danger'}>{t(msg.text)}</Alert>}
      <TableWrap>
        <Table className="min-w-[520px]">
          <caption className="sr-only">
            {t(
              'Every signed-in account, when it was created, and the role it holds',
            )}
          </caption>
          <thead>
            <tr>
              <Th>{t('Email')}</Th>
              <Th className="w-32">{t('Joined')}</Th>
              <Th className="w-44">{t('Role')}</Th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const isSelf = r.user_id === selfId;
              return (
                <Fragment key={r.user_id}>
                  <Tr>
                    <Td>
                      <span className="break-all">{r.email}</span>
                      {isSelf && (
                        <span className="ml-2 text-caption text-fg-subtle">
                          {t('you')}
                        </span>
                      )}
                    </Td>
                    <Td className="tnum text-fg-muted">
                      {t(formatJoined(r.created_at, locale))}
                    </Td>
                    <Td>
                      {r.role === 'staff' || r.role === 'staff_pending' ? (
                        // Staff logins are approved and linked to a person on
                        // the Team page; a role flip here would skip the link.
                        <p className="text-body-sm text-fg">
                          {t(r.role === 'staff' ? 'Staff' : 'Staff, waiting')}{' '}
                          <Link
                            href="/admin/team"
                            className="rounded text-fg-muted underline underline-offset-4 hover:text-fg focus-visible:outline-none focus-visible:shadow-focusRing"
                          >
                            {t('Manage on Team')}
                          </Link>
                        </p>
                      ) : (
                        <>
                          <label
                            htmlFor={`role-${r.user_id}`}
                            className="sr-only"
                          >
                            {t('Role for {email}', { email: r.email })}
                          </label>
                          <Select
                            id={`role-${r.user_id}`}
                            defaultValue={r.role}
                            disabled={isSelf || pendingId === r.user_id}
                            onChange={(e) => {
                              // Only one question at a time: a pick in another
                              // row puts the first back.
                              if (ask && ask.userId !== r.user_id)
                                ask.select.value = ask.from;
                              setAsk({
                                userId: r.user_id,
                                email: r.email,
                                from: r.role,
                                to: e.target.value,
                                select: e.target,
                              });
                            }}
                          >
                            {ROLES.map(([value, label]) => (
                              <option key={value} value={value}>
                                {t(label)}
                              </option>
                            ))}
                          </Select>
                          {isSelf && (
                            <p className="mt-1.5 text-caption text-fg-subtle">
                              {t('You cannot change your own role.')}
                            </p>
                          )}
                        </>
                      )}
                    </Td>
                  </Tr>
                  {ask?.userId === r.user_id ? (
                    <tr>
                      <td colSpan={3} className="px-4 pb-3">
                        <div
                          role="group"
                          className="flex flex-wrap items-center gap-2 rounded-xl border border-line bg-surface-subtle px-3 py-2 text-caption text-fg"
                        >
                          <span className="min-w-0 flex-1">
                            {t('Change {email} from {from} to {to}?', {
                              email: ask.email,
                              from: t(label(ask.from)),
                              to: t(label(ask.to)),
                            })}
                            {ask.to === 'admin' ? (
                              <span className="block">
                                {t(
                                  'Admins can see and change everything in the console.',
                                )}
                              </span>
                            ) : null}
                          </span>
                          <Button
                            size="sm"
                            onClick={() => {
                              const a = ask;
                              setAsk(null);
                              void change(a.userId, a.to, a.select, a.from);
                            }}
                          >
                            {t('Save')}
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            autoFocus
                            onClick={() => {
                              ask.select.value = ask.from;
                              setAsk(null);
                            }}
                          >
                            {t('Cancel')}
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ) : null}
                </Fragment>
              );
            })}
          </tbody>
        </Table>
      </TableWrap>
    </div>
  );
}
