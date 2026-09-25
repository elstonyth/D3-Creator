'use client';

/**
 * One week of shoots, Monday to Sunday — the team's group-chat schedule as a
 * page. Used by the staff portal (everyone's shoots visible, only your own
 * editable) and the admin console's Schedule page (everything editable, a
 * person picked when adding).
 *
 * Saves wait for the server rather than guessing: a shoot needs its real id
 * and the server's validation, and each save is a single small write, so the
 * form simply stays open with the reason when one is refused.
 *
 * Staff work from this month on; earlier shoots are read-only to them (the
 * server enforces it too), because a counted month is changed by an admin.
 */

import { useMemo, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { useI18n } from '@gitroom/frontend/components/i18n/locale-provider';
import { localeTag } from '@gitroom/frontend/lib/i18n';
import { Alert } from '@gitroom/frontend/components/ui/alert';
import { Pill } from './pill';
import { Button, ButtonLink } from '@gitroom/frontend/components/ui/button';
import { Field, Input, Select } from '@gitroom/frontend/components/ui/input';
import { addDays } from '@gitroom/frontend/lib/tracker';
import {
  sortShoots,
  weekDays,
  weekStart,
  type Shoot,
  type ShootStatus,
} from '@gitroom/frontend/lib/team/shoots';
import {
  addShoot,
  deleteShoot,
  setShootStatus,
  updateShoot,
  type ShootResult,
} from '@gitroom/frontend/lib/team/shoot-actions';
import { draftOf, ShootForm, type ShootDraft } from './shoot-form';

export interface WeekScheduleProps {
  /** Monday, `YYYY-MM-DD`. */
  start: string;
  today: string;
  shoots: Shoot[];
  /** Everyone who is or was on the board — names for every shoot. */
  people: { id: string; name: string; archived: boolean }[];
  accounts: { id: string; name: string }[];
  /** The staff member's own person; null when an admin is looking. */
  meId: string | null;
  /** The page the week links point at (`?week=` is added). */
  basePath: string;
}

type Open =
  | { kind: 'add'; date: string }
  | { kind: 'edit' | 'done' | 'delete'; id: string }
  | null;

function fmt(
  key: string,
  tag: 'en' | 'zh-CN',
  opts: Intl.DateTimeFormatOptions,
): string {
  return new Intl.DateTimeFormat(tag, { timeZone: 'UTC', ...opts }).format(
    new Date(`${key}T00:00:00Z`),
  );
}

export function WeekSchedule({
  start,
  today,
  shoots: initialShoots,
  people,
  accounts,
  meId,
  basePath,
}: WeekScheduleProps) {
  const { t, locale } = useI18n();
  const router = useRouter();
  const tag = localeTag(locale);
  const isAdmin = meId === null;
  const [shoots, setShoots] = useState(initialShoots);
  // 'all', or a person's id.
  const [filter, setFilter] = useState('all');
  const [open, setOpen] = useState<Open>(null);
  const [saving, setSaving] = useState(false);
  // A refusal, and what it belongs to: a shoot's id, or `add:<day>`.
  const [error, setError] = useState<{ at: string; text: string } | null>(null);

  const nameOf = useMemo(
    () => new Map(people.map((p) => [p.id, p.name])),
    [people],
  );
  const accountOf = useMemo(
    () => new Map(accounts.map((a) => [a.id, a.name])),
    [accounts],
  );
  const onBoard = useMemo(() => people.filter((p) => !p.archived), [people]);
  const archived = useMemo(
    () => new Set(people.filter((p) => p.archived).map((p) => p.id)),
    [people],
  );
  const personName = (id: string) => {
    const name = nameOf.get(id) ?? '—';
    return archived.has(id) ? t('{name} (left)', { name }) : name;
  };

  const days = weekDays(start);
  const shown = shoots.filter((s) => filter === 'all' || s.memberId === filter);
  // First day of this month: staff change nothing dated before it.
  const monthStart = `${today.slice(0, 7)}-01`;
  const canEdit = (s: Shoot) =>
    isAdmin || (s.memberId === meId && s.date >= monthStart);
  const weekHref = (monday: string) => `${basePath}?week=${monday}`;
  const thisWeek = weekStart(today);

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
    // These actions don't revalidate the page (the board keeps its own
    // state); drop the router's cached copy so Back/Forward can't bring back
    // the page as it was before this save.
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
    title: d.title,
    creatorId: d.creatorId,
    videosPlanned: d.videosPlanned,
    note: d.note,
  });
  const replace = (next: Shoot) =>
    setShoots((p) => sortShoots(p.map((x) => (x.id === next.id ? next : x))));

  const add = (day: string, d: ShootDraft) =>
    save(
      `add:${day}`,
      () => addShoot(input(d), isAdmin ? d.memberId : undefined),
      (r) => setShoots((p) => sortShoots([...p, r.shoot!])),
      open,
    );
  const edit = (s: Shoot, d: ShootDraft) =>
    save(
      s.id,
      () => updateShoot(s.id, input(d), input(draftOf(s, s.date))),
      (r) => replace(r.shoot!),
      open,
    );
  // Done comes from its small form; Cancel shoot and Reopen are one click.
  const status = (s: Shoot, next: ShootStatus, videosShot: string | null) =>
    save(
      s.id,
      () => setShootStatus(s.id, next, videosShot),
      (r) => replace(r.shoot!),
      next === 'done' ? open : null,
    );
  const remove = (s: Shoot) =>
    save(
      s.id,
      () => deleteShoot(s.id),
      () => setShoots((p) => p.filter((x) => x.id !== s.id)),
      open,
    );

  const end = addDays(start, 6);

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap items-center gap-1.5">
          <ButtonLink
            href={weekHref(addDays(start, -7))}
            variant="ghost"
            size="sm"
            aria-label={t('Previous week')}
          >
            ←
          </ButtonLink>
          <h2 className="px-1 text-heading tnum text-fg">
            {fmt(start, tag, { day: 'numeric', month: 'short' })} –{' '}
            {fmt(end, tag, { day: 'numeric', month: 'short', year: 'numeric' })}
          </h2>
          <ButtonLink
            href={weekHref(addDays(start, 7))}
            variant="ghost"
            size="sm"
            aria-label={t('Next week')}
          >
            →
          </ButtonLink>
          {start !== thisWeek ? (
            <ButtonLink href={basePath} variant="outline" size="sm">
              {t('This week')}
            </ButtonLink>
          ) : null}
        </div>

        {isAdmin ? (
          <div className="w-full sm:w-56">
            <label htmlFor="schedule-person" className="sr-only">
              {t('Show whose shoots')}
            </label>
            <Select
              id="schedule-person"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
            >
              <option value="all">{t('Everyone')}</option>
              {onBoard.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </Select>
          </div>
        ) : (
          <div
            role="group"
            aria-label={t('Show whose shoots')}
            className="flex gap-1"
          >
            <Button
              size="sm"
              variant={filter === 'all' ? 'secondary' : 'ghost'}
              aria-pressed={filter === 'all'}
              onClick={() => setFilter('all')}
            >
              {t('Everyone')}
            </Button>
            <Button
              size="sm"
              variant={filter === meId ? 'secondary' : 'ghost'}
              aria-pressed={filter === meId}
              onClick={() => setFilter(meId!)}
            >
              {t('Mine')}
            </Button>
          </div>
        )}
      </div>

      <div className="grid items-start gap-3 lg:grid-cols-2">
        {days.map((day) => {
          const list = shown.filter((s) => s.date === day);
          const isToday = day === today;
          const adding = open?.kind === 'add' && open.date === day;
          const canAdd = isAdmin || day >= monthStart;
          return (
            <section
              key={day}
              aria-label={fmt(day, tag, {
                weekday: 'long',
                day: 'numeric',
                month: 'long',
              })}
              className={
                isToday
                  ? 'rounded-2xl border border-line-strong bg-surface p-4'
                  : 'rounded-2xl border border-line bg-surface p-4'
              }
            >
              <header className="mb-3 flex items-center justify-between gap-3">
                <h3 className="flex flex-wrap items-center gap-2 text-label text-fg">
                  {fmt(day, tag, { weekday: 'long' })}
                  <span className="tnum text-fg-muted">
                    {fmt(day, tag, { day: 'numeric', month: 'short' })}
                  </span>
                  {isToday ? <Pill>{t('Today')}</Pill> : null}
                </h3>
                {adding || !canAdd ? null : (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      setError(null);
                      setOpen({ kind: 'add', date: day });
                    }}
                    aria-label={t('Add a shoot on {day}', {
                      day: fmt(day, tag, { weekday: 'long' }),
                    })}
                  >
                    {t('+ Add')}
                  </Button>
                )}
              </header>

              {adding ? (
                <div className="mb-3">
                  <ShootForm
                    initial={draftOf(null, day, filter === 'all' ? '' : filter)}
                    accounts={accounts}
                    people={isAdmin ? onBoard : undefined}
                    minDate={isAdmin ? undefined : monthStart}
                    saving={saving}
                    error={errorAt(`add:${day}`)}
                    onSave={(d) => add(day, d)}
                    onCancel={close}
                  />
                </div>
              ) : null}

              {list.length === 0 && !adding ? (
                <p className="text-caption text-fg-subtle">
                  {t('Nothing planned.')}
                </p>
              ) : (
                <ul className="space-y-2">
                  {list.map((s) =>
                    open?.kind === 'edit' && open.id === s.id ? (
                      <li key={s.id}>
                        <ShootForm
                          initial={draftOf(s, s.date)}
                          accounts={accounts}
                          minDate={isAdmin ? undefined : monthStart}
                          saving={saving}
                          error={errorAt(s.id)}
                          onSave={(d) => edit(s, d)}
                          onCancel={close}
                        />
                      </li>
                    ) : (
                      <ShootItem
                        key={s.id}
                        shoot={s}
                        person={personName(s.memberId)}
                        account={
                          s.creatorId
                            ? (accountOf.get(s.creatorId) ?? null)
                            : null
                        }
                        showPerson={isAdmin || s.memberId !== meId}
                        editable={canEdit(s)}
                        open={
                          open && 'id' in open && open.id === s.id
                            ? open.kind
                            : null
                        }
                        saving={saving}
                        error={errorAt(s.id)}
                        onOpen={(kind) => {
                          setError(null);
                          setOpen({ kind, id: s.id });
                        }}
                        onClose={close}
                        onStatus={(next, shot) => status(s, next, shot)}
                        onDelete={() => remove(s)}
                      />
                    ),
                  )}
                </ul>
              )}
            </section>
          );
        })}
      </div>
    </div>
  );
}

function ShootItem({
  shoot: s,
  person,
  account,
  showPerson,
  editable,
  open,
  saving,
  error,
  onOpen,
  onClose,
  onStatus,
  onDelete,
}: {
  shoot: Shoot;
  person: string;
  account: string | null;
  showPerson: boolean;
  editable: boolean;
  open: 'add' | 'edit' | 'done' | 'delete' | null;
  saving: boolean;
  /** Why the last save on this shoot was refused. */
  error: string | null;
  onOpen: (kind: 'edit' | 'done' | 'delete') => void;
  onClose: () => void;
  onStatus: (next: ShootStatus, videosShot: string | null) => void;
  onDelete: () => void;
}) {
  const { t } = useI18n();
  // Starts from what was shot, else what was planned.
  const saved =
    s.videosShot == null
      ? s.videosPlanned == null
        ? ''
        : String(s.videosPlanned)
      : String(s.videosShot);
  const [shot, setShot] = useState(saved);
  const cancelled = s.status === 'cancelled';
  const meta = [
    showPerson ? person : null,
    account,
    s.videosPlanned != null
      ? t('{count} videos planned', { count: s.videosPlanned })
      : null,
  ].filter(Boolean);

  function markDone(e: FormEvent) {
    e.preventDefault();
    onStatus('done', shot);
  }

  return (
    <li className="rounded-lg border border-line bg-surface-subtle p-3">
      <div className="flex items-start gap-3">
        <span className="w-12 shrink-0 pt-0.5 text-label tnum text-fg-muted">
          {s.time ?? '—'}
        </span>
        <div className="min-w-0 flex-1">
          <p
            className={
              cancelled
                ? 'break-words text-body text-fg-muted line-through'
                : 'break-words text-body text-fg'
            }
          >
            {s.title}
          </p>
          {meta.length > 0 ? (
            <p className="mt-0.5 text-caption text-fg-muted">
              {meta.join(' · ')}
            </p>
          ) : null}
          {s.note ? (
            <p className="mt-1 break-words text-caption text-fg-subtle">
              {s.note}
            </p>
          ) : null}
        </div>
        {s.status === 'done' ? (
          <Pill className="shrink-0">
            {s.videosShot != null
              ? t('Finished · {count} videos', { count: s.videosShot })
              : t('Finished')}
          </Pill>
        ) : cancelled ? (
          <Pill tone="muted" className="shrink-0">
            {t('Cancelled')}
          </Pill>
        ) : null}
      </div>

      {editable && open === 'done' ? (
        <form
          onSubmit={markDone}
          className="mt-3 flex flex-wrap items-end gap-2"
        >
          <div className="w-28">
            <Field label={t('Videos shot')} htmlFor={`shot-${s.id}`}>
              <Input
                id={`shot-${s.id}`}
                type="number"
                inputMode="numeric"
                min={0}
                max={99}
                step={1}
                value={shot}
                onChange={(e) => setShot(e.target.value)}
                autoFocus
              />
            </Field>
          </div>
          <Button type="submit" size="sm" loading={saving}>
            {t('Mark done')}
          </Button>
          <Button type="button" size="sm" variant="ghost" onClick={onClose}>
            {t('Cancel')}
          </Button>
          {error ? (
            <div className="w-full">
              <Alert tone="danger">{error}</Alert>
            </div>
          ) : null}
        </form>
      ) : editable && open === 'delete' ? (
        <div className="mt-3 space-y-2">
          <div
            role="group"
            aria-label={t('Delete {title}', { title: s.title })}
            className="flex flex-wrap items-center gap-2 text-caption text-fg"
          >
            <span className="min-w-0 flex-1">
              {t('Delete this shoot for good?')}
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
      ) : editable ? (
        <div className="mt-2 flex flex-wrap justify-end gap-1">
          {!cancelled ? (
            <Button
              size="sm"
              variant="ghost"
              onClick={() => onOpen('edit')}
              aria-label={t('Edit {title}', { title: s.title })}
            >
              {t('Edit')}
            </Button>
          ) : null}
          {s.status === 'planned' ? (
            <>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  // Start from what is saved, not an abandoned draft.
                  setShot(saved);
                  onOpen('done');
                }}
                aria-label={t('Done: {title}', { title: s.title })}
              >
                {t('Done')}
              </Button>
              <Button
                size="sm"
                variant="ghost"
                disabled={saving}
                onClick={() => onStatus('cancelled', null)}
                aria-label={t('Cancel shoot: {title}', { title: s.title })}
              >
                {t('Cancel shoot')}
              </Button>
            </>
          ) : (
            <Button
              size="sm"
              variant="ghost"
              disabled={saving}
              onClick={() => onStatus('planned', null)}
              aria-label={t('Reopen {title}', { title: s.title })}
            >
              {t('Reopen')}
            </Button>
          )}
          <Button
            size="sm"
            variant="ghost"
            onClick={() => onOpen('delete')}
            aria-label={t('Delete {title}', { title: s.title })}
          >
            {t('Delete')}
          </Button>
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
