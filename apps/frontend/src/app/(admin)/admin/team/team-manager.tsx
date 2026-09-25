'use client';

/**
 * Staff approvals and the team at a glance. A waiting signup is approved as
 * a new person on the board (named and placed as they asked, editable here)
 * or linked to a person already on it; the team list shows each person's
 * month so far and job (changeable here) and opens their profile.
 *
 * One action at a time. The card that acted stays busy until the refreshed
 * page arrives, so it cannot be clicked twice; a refusal is shown on it.
 */

import Link from 'next/link';
import { useState, useTransition, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { useI18n } from '@gitroom/frontend/components/i18n/locale-provider';
import { Alert } from '@gitroom/frontend/components/ui/alert';
import { Button } from '@gitroom/frontend/components/ui/button';
import { Field, Input, Select } from '@gitroom/frontend/components/ui/input';
import {
  dateKeyAt,
  parseMemberKind,
  type MemberKind,
} from '@gitroom/frontend/lib/tracker';
import {
  approveStaff,
  rejectStaff,
  setMemberKind,
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
  /** Only a confirmed email can be approved. */
  confirmed: boolean;
  /** Approved before, but the link to a person never landed. */
  approved: boolean;
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
  const [inFlight, startTransition] = useTransition();
  // Which action is running, e.g. `approve:<userId>` or `unlink:<memberId>`.
  const [acting, setActing] = useState<string | null>(null);
  // A success shows at the top (its card may be gone after the refresh); a
  // refusal shows on the card it came from.
  const [message, setMessage] = useState<{
    at: string;
    ok: boolean;
    text: string;
  } | null>(null);
  const [confirmUnlink, setConfirmUnlink] = useState<string | null>(null);
  // A job change shows at once; a refused one goes back.
  const [jobOf, setJobOf] = useState<Record<string, MemberKind>>({});

  function run(
    at: string,
    call: () => Promise<TeamResult>,
    done: string,
    undo?: () => void,
  ) {
    setActing(at);
    setMessage(null);
    startTransition(async () => {
      let r: TeamResult;
      try {
        r = await call();
      } catch {
        // A dropped connection or a stale deploy: a refusal, not a crash.
        r = { ok: false, message: 'Could not save. Try again.' };
      }
      startTransition(() => {
        if (!r.ok) {
          undo?.();
          setMessage({
            at,
            ok: false,
            text: r.message ?? 'Could not save. Try again.',
          });
          return;
        }
        setMessage({ at, ok: true, text: r.message ?? done });
        setConfirmUnlink(null);
        router.refresh();
      });
    });
  }
  const busy = (at: string) => inFlight && acting === at;
  const refusal = (...at: string[]) =>
    message && !message.ok && at.includes(message.at) ? t(message.text) : null;

  return (
    <div className="space-y-10">
      {message?.ok ? <Alert tone="success">{t(message.text)}</Alert> : null}

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
                locked={inFlight}
                approving={busy(`approve:${p.userId}`)}
                rejecting={busy(`reject:${p.userId}`)}
                error={refusal(`approve:${p.userId}`, `reject:${p.userId}`)}
                onApprove={(target) =>
                  run(
                    `approve:${p.userId}`,
                    () => approveStaff(p.userId, target),
                    'Approved. They can sign in now.',
                  )
                }
                onReject={() =>
                  run(
                    `reject:${p.userId}`,
                    () => rejectStaff(p.userId),
                    'Turned away.',
                  )
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
          {team.map((m) => {
            const error = refusal(`unlink:${m.id}`, `kind:${m.id}`);
            return (
              <li key={m.id} className="px-4 py-3">
                <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                  {/* Room for the name and the job select; the numbers wrap
                      below it on a narrow phone rather than overlap it. */}
                  <div className="min-w-[12rem] flex-1">
                    <div className="flex flex-wrap items-center gap-2 text-label text-fg">
                      {m.name}
                      <Select
                        aria-label={t('Job: {name}', { name: m.name })}
                        value={jobOf[m.id] ?? m.kind}
                        disabled={inFlight}
                        onChange={(e) => {
                          const next = parseMemberKind(e.target.value);
                          const shown = jobOf[m.id] ?? m.kind;
                          setJobOf((j) => ({ ...j, [m.id]: next }));
                          run(
                            `kind:${m.id}`,
                            () => setMemberKind(m.id, next),
                            'Job saved.',
                            () => setJobOf((j) => ({ ...j, [m.id]: shown })),
                          );
                        }}
                        className="h-8 w-auto py-0 pl-3 text-body-lg sm:text-caption"
                      >
                        <option value="handler">{t('Handler')}</option>
                        <option value="editor">{t('Editor')}</option>
                        <option value="both">{t('Handler & editor')}</option>
                      </Select>
                    </div>
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
                  <div className="flex w-full items-center justify-end gap-1 sm:w-64">
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
                        disabled={inFlight}
                        onClick={() => {
                          setMessage(null);
                          setConfirmUnlink(m.id);
                        }}
                        aria-label={t('Remove login: {name}', {
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
                      loading={busy(`unlink:${m.id}`)}
                      disabled={inFlight}
                      onClick={() =>
                        run(
                          `unlink:${m.id}`,
                          () => unlinkStaff(m.id),
                          'Login removed.',
                        )
                      }
                    >
                      {t('Remove login')}
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => setConfirmUnlink(null)}
                      autoFocus
                    >
                      {t('Keep')}
                    </Button>
                  </div>
                ) : null}
                {error ? (
                  <div className="mt-3">
                    <Alert tone="danger">{error}</Alert>
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
      </section>
    </div>
  );
}

function PendingCard({
  signup: p,
  unlinked,
  locked,
  approving,
  rejecting: turningAway,
  error,
  onApprove,
  onReject,
}: {
  signup: PendingSignup;
  unlinked: { id: string; name: string }[];
  /** Some action is running: nothing else may start. */
  locked: boolean;
  approving: boolean;
  rejecting: boolean;
  /** Why this card's last action was refused. */
  error: string | null;
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
    if (!ready || locked || !p.confirmed) return;
    onApprove(mode === 'new' ? { name, kind } : { memberId });
  }

  return (
    <li className="rounded-2xl border border-line bg-surface p-4">
      <p className="break-all text-label text-fg">{p.email}</p>
      <p className="mt-0.5 text-caption text-fg-subtle">
        {t('Signed up {when} as “{name}”, {job}.', {
          when: dateKeyAt(new Date(p.signedUpAt)),
          name: p.name || '—',
          job:
            p.kind === 'both'
              ? t('handler & editor')
              : p.kind === 'editor'
                ? t('editor')
                : t('handler'),
        })}
      </p>
      {p.approved ? (
        <p className="mt-1 text-caption text-fg-muted">
          {t('Approved before, but not linked to anyone yet.')}
        </p>
      ) : null}
      {!p.confirmed ? (
        <p className="mt-1 text-caption text-fg-muted">
          {t(
            'Their email is not confirmed yet. Approve once they open the link we sent.',
          )}
        </p>
      ) : null}

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
                onChange={(e) => setKind(parseMemberKind(e.target.value))}
              >
                <option value="handler">{t('Handler')}</option>
                <option value="editor">{t('Editor')}</option>
                <option value="both">{t('Handler & editor')}</option>
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

        {error ? <Alert tone="danger">{error}</Alert> : null}

        {rejecting ? (
          <div className="flex flex-wrap items-center gap-2 text-caption text-fg">
            <span className="min-w-0 flex-1">
              {t('Turn this signup away? The login stays but reaches nothing.')}
            </span>
            <Button
              type="button"
              size="sm"
              variant="danger"
              loading={turningAway}
              disabled={locked}
              onClick={onReject}
            >
              {t('Turn away')}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => setRejecting(false)}
              autoFocus
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
              disabled={locked}
              onClick={() => setRejecting(true)}
            >
              {t('Turn away')}
            </Button>
            {/* Not yellow: with several signups waiting, the page would have
                one per card. */}
            <Button
              type="submit"
              size="sm"
              variant="secondary"
              loading={approving}
              disabled={!ready || locked || !p.confirmed}
            >
              {t('Approve')}
            </Button>
          </div>
        )}
      </form>
    </li>
  );
}
