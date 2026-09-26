'use client';

/**
 * One day's shoots, the panel under a work tracker's calendar. On the staff
 * tracker they are the staff member's own, to add, change and pass on; on
 * the admin's tracker they are everyone's, read-only (no `setShoots`).
 *
 * After a shoot its owner passes the videos on from its card: one row per
 * video, each given to an editor. That marks the shoot done; passing again
 * adds more.
 *
 * Saves wait for the server rather than guessing: a shoot needs its real id
 * and the server's validation, and each save is a single small write, so the
 * form simply stays open with the reason when one is refused. The tracker
 * owns the list (its calendar and spotlight read it too); this panel hands
 * each saved row back through `setShoots`.
 *
 * Staff change, cancel and delete from this month on; earlier shoots are
 * closed (the server enforces it too), because a counted month stays put.
 * Passing videos on has no such limit.
 */

import { useState, type Dispatch, type SetStateAction } from 'react';
import { useRouter } from 'next/navigation';
import { useI18n } from '@gitroom/frontend/components/i18n/locale-provider';
import { localeTag } from '@gitroom/frontend/lib/i18n';
import { Alert } from '@gitroom/frontend/components/ui/alert';
import { Button } from '@gitroom/frontend/components/ui/button';
import type { MemberKind } from '@gitroom/frontend/lib/tracker';
import { sortShoots, type Shoot } from '@gitroom/frontend/lib/team/shoots';
import { isEditorKind, type PassRow } from '@gitroom/frontend/lib/team/videos';
import {
  addShoot,
  deleteShoot,
  passVideos,
  setShootStatus,
  updateShoot,
  type ShootResult,
} from '@gitroom/frontend/lib/team/shoot-actions';
import { cn } from '@gitroom/frontend/lib/utils';
// clsx where a custom font-size token sits next to a text colour:
// tailwind-merge would drop the size (see tracker-shell.tsx).
import clsx from 'clsx';
import { draftOf, ShootForm, type ShootDraft } from './shoot-form';
import { PassVideosForm } from './pass-videos-form';
import { Pill } from './pill';
import { GlassPanel } from './glass-panel';
import { fmtDate } from './tracker-shell';
import s from './tracker.module.scss';

export interface DayShootsProps {
  /** `YYYY-MM-DD` */
  day: string;
  today: string;
  /** That day's shoots, in schedule order. */
  shoots: Shoot[];
  /**
   * Everyone who is or was on the board — names for every shoot, and the
   * editors a shoot's videos can be passed to.
   */
  people: { id: string; name: string; kind: MemberKind; archived: boolean }[];
  accounts: { id: string; name: string }[];
  /** The staff member's own person; null on the admin's view. */
  meId: string | null;
  /** The tracker's whole list. Absent = read-only (the admin's view). */
  setShoots?: Dispatch<SetStateAction<Shoot[]>>;
  className?: string;
}

type ItemStep = 'edit' | 'pass' | 'delete';
type Open = { kind: 'add' } | { kind: ItemStep; id: string } | null;

export function DayShoots({
  day,
  today,
  shoots,
  people,
  accounts,
  meId,
  setShoots,
  className,
}: DayShootsProps) {
  const { t, locale } = useI18n();
  const router = useRouter();
  const tag = localeTag(locale);
  // Whose shoots can be changed here: nobody's on the admin's view.
  const me = setShoots ? meId : null;
  const [open, setOpen] = useState<Open>(null);
  const [saving, setSaving] = useState(false);
  // A refusal, and what it belongs to: a shoot's id, or `add`.
  const [error, setError] = useState<{ at: string; text: string } | null>(null);

  const nameOf = new Map(people.map((p) => [p.id, p.name]));
  const accountOf = new Map(accounts.map((a) => [a.id, a.name]));
  const editors = people.filter((p) => !p.archived && isEditorKind(p.kind));
  const archived = new Set(people.filter((p) => p.archived).map((p) => p.id));
  const personName = (id: string) => {
    const name = nameOf.get(id) ?? '—';
    return archived.has(id) ? t('{name} (left)', { name }) : name;
  };

  // First day of this month: staff change nothing dated before it.
  const monthStart = `${today.slice(0, 7)}-01`;
  const canAdd = me !== null && day >= monthStart;
  const adding = open?.kind === 'add';

  /**
   * One save. A refusal is shown where it belongs, the form still open.
   * `started` is the form it came from: only that form closes when it
   * succeeds, so a slow one-click change never closes a form opened since.
   */
  async function save(
    at: string,
    call: () => Promise<ShootResult>,
    apply: (r: ShootResult) => void,
    started: Open = null,
  ) {
    setSaving(true);
    setError(null);
    let r: ShootResult;
    try {
      r = await call();
    } catch {
      // A dropped connection or a stale deploy: a refusal, not a frozen board.
      r = { ok: false, message: 'Could not save. Try again.' };
    } finally {
      setSaving(false);
    }
    if (!r.ok) {
      setError({ at, text: r.message ?? 'Could not save. Try again.' });
      return;
    }
    apply(r);
    if (started) setOpen((cur) => (cur === started ? null : cur));
    // Re-read the page: the tracker's other panels (the videos just passed
    // on, the month's numbers) come from the server.
    router.refresh();
  }
  const errorAt = (at: string) => (error?.at === at ? t(error.text) : null);
  const close = () => {
    setOpen(null);
    setError(null);
  };

  const input = (d: ShootDraft) => ({
    date: d.date,
    time: d.time,
    creatorId: d.creatorId,
    note: d.note,
  });
  const replace = (next: Shoot) =>
    setShoots?.((p) => sortShoots(p.map((x) => (x.id === next.id ? next : x))));

  const add = (d: ShootDraft) =>
    save(
      'add',
      () => addShoot(input(d)),
      (r) => setShoots?.((p) => sortShoots([...p, r.shoot!])),
      open,
    );
  const edit = (x: Shoot, d: ShootDraft) =>
    save(
      x.id,
      () => updateShoot(x.id, input(d), input(draftOf(x, x.date))),
      (r) => replace(r.shoot!),
      open,
    );
  // Cancel shoot and Reopen are one click.
  const status = (x: Shoot, next: 'planned' | 'cancelled') =>
    save(
      x.id,
      () => setShootStatus(x.id, next),
      (r) => replace(r.shoot!),
    );
  const pass = (x: Shoot, rows: PassRow[]) =>
    save(
      x.id,
      () => passVideos(x.id, rows),
      (r) => replace(r.shoot!),
      open,
    );
  const remove = (x: Shoot) =>
    save(
      x.id,
      () => deleteShoot(x.id),
      () => setShoots?.((p) => p.filter((y) => y.id !== x.id)),
      open,
    );

  const label = fmtDate(day, tag, {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  });

  return (
    <GlassPanel className={cn('p-5 sm:p-6', className)}>
      <section aria-label={label}>
        <div className="mb-4 flex items-end justify-between gap-3">
          <div className="min-w-0">
            <p className="text-micro uppercase tracking-[0.14em] text-fg-subtle">
              {t('Shoots for')}
            </p>
            <h2 className="mt-1 text-heading text-fg">{label}</h2>
          </div>
          {adding || !canAdd ? null : (
            <button
              type="button"
              onClick={() => {
                setError(null);
                setOpen({ kind: 'add' });
              }}
              className={clsx(
                s.pill,
                'h-10 shrink-0 px-4 text-label text-fg focus-visible:outline-none focus-visible:shadow-focusRing',
              )}
            >
              {t('+ Add a shoot')}
            </button>
          )}
        </div>

        {adding ? (
          <div className="mb-3">
            <ShootForm
              initial={draftOf(null, day)}
              accounts={accounts}
              minDate={monthStart}
              saving={saving}
              error={errorAt('add')}
              onSave={add}
              onCancel={close}
            />
          </div>
        ) : null}

        {shoots.length === 0 && !adding ? (
          <p className="py-4 text-body text-fg-muted">
            {t('Nothing planned.')}
          </p>
        ) : (
          <ul className="space-y-2">
            {shoots.map((x) =>
              open?.kind === 'edit' && open.id === x.id ? (
                <li key={x.id}>
                  <ShootForm
                    initial={draftOf(x, x.date)}
                    accounts={accounts}
                    minDate={monthStart}
                    saving={saving}
                    error={errorAt(x.id)}
                    onSave={(d) => edit(x, d)}
                    onCancel={close}
                  />
                </li>
              ) : (
                <ShootItem
                  key={x.id}
                  shoot={x}
                  person={personName(x.memberId)}
                  account={
                    x.creatorId ? (accountOf.get(x.creatorId) ?? null) : null
                  }
                  showPerson={x.memberId !== me}
                  mine={x.memberId === me}
                  // Change, cancel, reopen, delete: from this month on.
                  // Passing videos on: any day.
                  changeable={x.memberId === me && x.date >= monthStart}
                  editors={editors}
                  open={
                    open && 'id' in open && open.id === x.id ? open.kind : null
                  }
                  saving={saving}
                  error={errorAt(x.id)}
                  onOpen={(kind) => {
                    setError(null);
                    setOpen({ kind, id: x.id });
                  }}
                  onClose={close}
                  onStatus={(next) => status(x, next)}
                  onPass={(rows) => pass(x, rows)}
                  onDelete={() => remove(x)}
                />
              ),
            )}
          </ul>
        )}
      </section>
    </GlassPanel>
  );
}

function ShootItem({
  shoot: x,
  person,
  account,
  showPerson,
  mine,
  changeable,
  editors,
  open,
  saving,
  error,
  onOpen,
  onClose,
  onStatus,
  onPass,
  onDelete,
}: {
  shoot: Shoot;
  person: string;
  account: string | null;
  showPerson: boolean;
  /** Mine: its videos can be passed on, unless it was cancelled. */
  mine: boolean;
  /** Mine and not in a closed month: can be changed, cancelled, deleted. */
  changeable: boolean;
  /** Who its videos can be given to. */
  editors: { id: string; name: string }[];
  open: ItemStep | null;
  saving: boolean;
  /** Why the last save on this shoot was refused. */
  error: string | null;
  onOpen: (kind: ItemStep) => void;
  onClose: () => void;
  onStatus: (next: 'planned' | 'cancelled') => void;
  onPass: (rows: PassRow[]) => void;
  onDelete: () => void;
}) {
  const { t } = useI18n();
  const cancelled = x.status === 'cancelled';
  const canPass = mine && !cancelled;
  // What the shoot is called: an old shoot's own title, else its account.
  const name = x.title ?? account ?? t('Shoot');
  const meta = [showPerson ? person : null, x.title ? account : null].filter(
    Boolean,
  );
  // Buttons name an untitled shoot by its time too: a day can hold two
  // shoots for one account.
  const label = x.title ?? [x.time, name].filter(Boolean).join(' ');

  return (
    <li className={cn(s.inset, 'p-3 sm:px-4')}>
      <div className="flex items-start gap-3">
        <span className="w-12 shrink-0 pt-0.5 text-label tnum text-fg-muted">
          {x.time ?? '—'}
        </span>
        <div className="min-w-0 flex-1">
          <p
            className={
              cancelled
                ? 'break-words text-body text-fg-muted line-through'
                : 'break-words text-body text-fg'
            }
          >
            {name}
          </p>
          {meta.length > 0 ? (
            <p className="mt-0.5 text-caption text-fg-muted">
              {meta.join(' · ')}
            </p>
          ) : null}
          {x.note ? (
            <p className="mt-1 break-words text-caption text-fg-subtle">
              {x.note}
            </p>
          ) : null}
        </div>
        {x.status === 'done' ? (
          <Pill className="shrink-0">
            {t('{count} videos passed', { count: x.videosShot ?? 0 })}
          </Pill>
        ) : cancelled ? (
          <Pill tone="muted" className="shrink-0">
            {t('Cancelled')}
          </Pill>
        ) : (
          <Pill tone="muted" className="shrink-0">
            {t('Planned')}
          </Pill>
        )}
      </div>

      {canPass && open === 'pass' ? (
        <PassVideosForm
          editors={editors}
          saving={saving}
          error={error}
          onSave={onPass}
          onCancel={onClose}
        />
      ) : changeable && open === 'delete' ? (
        <div className="mt-3 space-y-2">
          <div
            role="group"
            aria-label={t('Delete {title}', { title: label })}
            className="flex flex-wrap items-center gap-2 text-caption text-fg"
          >
            <span className="min-w-0 flex-1">
              {x.status === 'done'
                ? t(
                    'Delete this shoot for good? The videos passed on from it stay.',
                  )
                : t('Delete this shoot for good?')}
            </span>
            <Button
              size="sm"
              variant="danger"
              loading={saving}
              onClick={onDelete}
            >
              {t('Delete')}
            </Button>
            <Button size="sm" variant="ghost" onClick={onClose} autoFocus>
              {t('Keep')}
            </Button>
          </div>
          {error ? <Alert tone="danger">{error}</Alert> : null}
        </div>
      ) : changeable || canPass ? (
        <div className="mt-2 flex flex-wrap justify-end gap-1">
          {changeable && !cancelled ? (
            <Button
              size="sm"
              variant="ghost"
              onClick={() => onOpen('edit')}
              aria-label={t('Change {title}', { title: label })}
            >
              {t('Change')}
            </Button>
          ) : null}
          {canPass ? (
            <Button
              size="sm"
              variant="secondary"
              onClick={() => onOpen('pass')}
              aria-label={t('Pass videos: {title}', { title: label })}
            >
              {t('Pass videos')}
            </Button>
          ) : null}
          {changeable && x.status === 'planned' ? (
            <Button
              size="sm"
              variant="ghost"
              disabled={saving}
              onClick={() => onStatus('cancelled')}
              aria-label={t('Cancel shoot: {title}', { title: label })}
            >
              {t('Cancel shoot')}
            </Button>
          ) : null}
          {changeable && cancelled ? (
            <Button
              size="sm"
              variant="ghost"
              disabled={saving}
              onClick={() => onStatus('planned')}
              aria-label={t('Reopen {title}', { title: label })}
            >
              {t('Reopen')}
            </Button>
          ) : null}
          {changeable ? (
            <Button
              size="sm"
              variant="ghost"
              onClick={() => onOpen('delete')}
              aria-label={t('Delete {title}', { title: label })}
            >
              {t('Delete')}
            </Button>
          ) : null}
          {/* A one-click change (Cancel shoot, Reopen) that was refused. */}
          {error ? (
            <div className="w-full">
              <Alert tone="danger">{error}</Alert>
            </div>
          ) : null}
        </div>
      ) : null}
    </li>
  );
}
