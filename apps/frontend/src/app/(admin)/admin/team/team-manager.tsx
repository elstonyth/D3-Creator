'use client';

/**
 * Staff approvals and the team at a glance. A waiting signup is approved as
 * a new person on the board (named and placed as they asked, editable here)
 * or linked to a person already on it; the team list shows each person's
 * month so far and opens their profile.
 */

import Link from 'next/link';
import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { useI18n } from '@gitroom/frontend/components/i18n/locale-provider';
import { Alert } from '@gitroom/frontend/components/ui/alert';
import { Badge } from '@gitroom/frontend/components/ui/badge';
import { Button } from '@gitroom/frontend/components/ui/button';
import { Field, Input, Select } from '@gitroom/frontend/components/ui/input';
import type { MemberKind } from '@gitroom/frontend/lib/tracker';
import {
  approveStaff,
  rejectStaff,
  unlinkStaff,
  type TeamResult,
} from './actions';

export interface PendingSignup {
  userId: string;
  email: string;
  /** What they typed at signup; the admin confirms it. */
  name: string;
  kind: MemberKind;
  signedUpAt: string;
}

export interface TeamRow {
  id: string;
  name: string;
  kind: MemberKind;
  email: string | null;
  edited: number;
  posted: number;
  shootsDone: number;
  profileHref: string;
}

export function TeamManager({
  pending,
  team,
  unlinked,
}: {
  pending: PendingSignup[];
  team: TeamRow[];
  /** People on the board with no login yet, for "link to an existing person". */
  unlinked: { id: string; name: string }[];
}) {
  const { t } = useI18n();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(
    null,
  );
  const [confirmUnlink, setConfirmUnlink] = useState<string | null>(null);

  async function run(call: () => Promise<TeamResult>, done: string) {
    setBusy(true);
    setMessage(null);
    const r = await call();
    setBusy(false);
    setMessage(
      r.ok
        ? { ok: true, text: done }
        : { ok: false, text: r.message ?? 'Could not save. Try again.' },
    );
    if (r.ok) {
      setConfirmUnlink(null);
      router.refresh();
    }
  }

  return (
    <div className="space-y-10">
      {message ? (
        <Alert tone={message.ok ? 'success' : 'danger'}>
          {t(message.text)}
        </Alert>
      ) : null}

      <section aria-label={t('Waiting for approval')} className="space-y-3">
        <h2 className="text-heading text-fg">
          {t('Waiting for approval')}{' '}
          <span className="text-caption tnum text-fg-subtle">
            {pending.length}
          </span>
        </h2>
        {pending.length === 0 ? (
          <p className="rounded-2xl border border-line bg-surface p-4 text-body-sm text-fg-muted">
            {t('Nobody is waiting. New staff sign up at staff.d3creator.com.')}
          </p>
        ) : (
          <ul className="space-y-3">
            {pending.map((p) => (
              <PendingCard
                key={p.userId}
                signup={p}
                unlinked={unlinked}
                busy={busy}
                onApprove={(target) =>
                  run(
                    () => approveStaff(p.userId, target),
                    'Approved. They can sign in now.',
                  )
                }
                onReject={() =>
                  run(() => rejectStaff(p.userId), 'Turned away.')
                }
              />
            ))}
          </ul>
        )}
      </section>

      <section aria-label={t('The team')} className="space-y-3">
        <h2 className="text-heading text-fg">{t('The team')}</h2>
        <p className="text-caption text-fg-subtle">
          {t(
            'This month so far. Open a profile for the videos, links and shoots behind the numbers.',
          )}
        </p>
        <ul className="divide-y divide-line rounded-2xl border border-line bg-surface">
          {team.map((m) => (
            <li key={m.id} className="px-4 py-3">
              <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                <div className="min-w-0 flex-1">
                  <p className="flex flex-wrap items-center gap-2 text-label text-fg">
                    {m.name}
                    <Badge tone="muted">
                      {m.kind === 'editor' ? t('Editor') : t('Handler')}
                    </Badge>
                  </p>
                  <p className="mt-0.5 break-all text-caption text-fg-subtle">
                    {m.email ?? t('No login yet')}
                  </p>
                </div>
                <dl className="flex gap-5 text-caption">
                  <div>
                    <dt className="text-fg-subtle">{t('Edited')}</dt>
                    <dd className="text-heading tnum text-fg">{m.edited}</dd>
                  </div>
                  <div>
                    <dt className="text-fg-subtle">{t('Posted')}</dt>
                    <dd className="text-heading tnum text-fg">{m.posted}</dd>
                  </div>
                  <div>
                    <dt className="text-fg-subtle">{t('Shoots')}</dt>
                    <dd className="text-heading tnum text-fg">
                      {m.shootsDone}
                    </dd>
                  </div>
                </dl>
                <div className="flex items-center gap-1">
                  <Link
                    href={m.profileHref}
                    className="rounded-md px-3 py-1.5 text-label text-fg hover:bg-white/[0.04] focus-visible:outline-none focus-visible:shadow-focusRing"
                  >
                    {t('Open profile')} →
                  </Link>
                  {m.email ? (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => setConfirmUnlink(m.id)}
                      aria-label={t('Take away {name}’s login', {
                        name: m.name,
                      })}
                    >
                      {t('Remove login')}
                    </Button>
                  ) : null}
                </div>
              </div>
              {confirmUnlink === m.id ? (
                <div
                  role="group"
                  aria-label={t('Take away {name}’s login', { name: m.name })}
                  className="mt-3 flex flex-wrap items-center gap-2 rounded-xl border border-line-strong bg-surface-subtle px-3 py-2 text-caption text-fg"
                >
                  <span className="min-w-0 flex-1">
                    {t(
                      '{name} keeps their place and history, but can no longer sign in to the staff portal.',
                      {
                        name: m.name,
                      },
                    )}
                  </span>
                  <Button
                    size="sm"
                    variant="danger"
                    loading={busy}
                    onClick={() =>
                      run(() => unlinkStaff(m.id), 'Login removed.')
                    }
                  >
                    {t('Remove login')}
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => setConfirmUnlink(null)}
                  >
                    {t('Keep')}
                  </Button>
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

function PendingCard({
  signup: p,
  unlinked,
  busy,
  onApprove,
  onReject,
}: {
  signup: PendingSignup;
  unlinked: { id: string; name: string }[];
  busy: boolean;
  onApprove: (
    target: { memberId: string } | { name: string; kind: MemberKind },
  ) => void;
  onReject: () => void;
}) {
  const { t } = useI18n();
  const [mode, setMode] = useState<'new' | 'link'>('new');
  const [name, setName] = useState(p.name);
  const [kind, setKind] = useState<MemberKind>(p.kind);
  const [memberId, setMemberId] = useState('');
  const [rejecting, setRejecting] = useState(false);
  const ready = mode === 'new' ? name.trim() !== '' : memberId !== '';

  function submit(e: FormEvent) {
    e.preventDefault();
    if (!ready) return;
    onApprove(mode === 'new' ? { name, kind } : { memberId });
  }

  return (
    <li className="rounded-2xl border border-line bg-surface p-4">
      <p className="break-all text-label text-fg">{p.email}</p>
      <p className="mt-0.5 text-caption text-fg-subtle">
        {t('Signed up {when} as “{name}”, {job}.', {
          when: p.signedUpAt.slice(0, 10),
          name: p.name || '—',
          job: p.kind === 'editor' ? t('editor') : t('handler'),
        })}
      </p>

      <form onSubmit={submit} className="mt-3 space-y-3">
        <div
          role="group"
          aria-label={t('Approve as')}
          className="flex flex-wrap gap-1"
        >
          <Button
            type="button"
            size="sm"
            variant={mode === 'new' ? 'secondary' : 'ghost'}
            aria-pressed={mode === 'new'}
            onClick={() => setMode('new')}
          >
            {t('New person')}
          </Button>
          <Button
            type="button"
            size="sm"
            variant={mode === 'link' ? 'secondary' : 'ghost'}
            aria-pressed={mode === 'link'}
            onClick={() => setMode('link')}
            disabled={unlinked.length === 0}
          >
            {t('Someone already on the board')}
          </Button>
        </div>

        {mode === 'new' ? (
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label={t('Name on the board')} htmlFor={`n-${p.userId}`}>
              <Input
                id={`n-${p.userId}`}
                value={name}
                onChange={(e) => setName(e.target.value)}
                maxLength={40}
                autoComplete="off"
              />
            </Field>
            <Field label={t('Row')} htmlFor={`k-${p.userId}`}>
              <Select
                id={`k-${p.userId}`}
                value={kind}
                onChange={(e) =>
                  setKind(e.target.value === 'editor' ? 'editor' : 'handler')
                }
              >
                <option value="handler">{t('Handler')}</option>
                <option value="editor">{t('Editor')}</option>
              </Select>
            </Field>
          </div>
        ) : (
          <Field label={t('Person')} htmlFor={`m-${p.userId}`}>
            <Select
              id={`m-${p.userId}`}
              value={memberId}
              onChange={(e) => setMemberId(e.target.value)}
            >
              <option value="">{t('Choose…')}</option>
              {unlinked.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </Select>
          </Field>
        )}

        {rejecting ? (
          <div className="flex flex-wrap items-center gap-2 text-caption text-fg">
            <span className="min-w-0 flex-1">
              {t('Turn this signup away? The login stays but reaches nothing.')}
            </span>
            <Button
              type="button"
              size="sm"
              variant="danger"
              loading={busy}
              onClick={onReject}
            >
              {t('Turn away')}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => setRejecting(false)}
            >
              {t('Keep')}
            </Button>
          </div>
        ) : (
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => setRejecting(true)}
            >
              {t('Turn away')}
            </Button>
            <Button type="submit" size="sm" loading={busy} disabled={!ready}>
              {t('Approve')}
            </Button>
          </div>
        )}
      </form>
    </li>
  );
}
