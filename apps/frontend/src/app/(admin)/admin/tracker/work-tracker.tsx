'use client';

/**
 * The board. One client island: the server page hands it the month's data and
 * every edit is applied locally first, then persisted through a server action;
 * a failed write rolls the edit back and says so.
 *
 * Panels: today/tomorrow spotlight · calendar · events for the picked day ·
 * tasks (drag to reorder) · remarks (autosave) · staffing board (drag an
 * account onto a person). Month navigation reloads the page with ?month=,
 * and the page keys this component on the month so the state resets cleanly.
 */

import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  useTransition,
  type FormEvent,
} from 'react';
import { useRouter } from 'next/navigation';
import { useI18n } from '@gitroom/frontend/components/i18n/locale-provider';
import { AuroraBackground } from '@gitroom/frontend/components/ui/aurora-background';
import { cn } from '@gitroom/frontend/lib/utils';
// clsx where a custom font-size token sits next to a text colour:
// tailwind-merge reads `text-label` / `text-metric-lg` as colours and
// would drop them in favour of the colour.
import clsx from 'clsx';
import { localeTag } from '@gitroom/frontend/lib/i18n';
import {
  addDays,
  addMonths,
  monthGrid,
  reorder,
  type TrackerData,
  type TrackerEvent,
  type TrackerMember,
  type TrackerPost,
  type TrackerShoot,
  type TrackerTask,
} from '@gitroom/frontend/lib/tracker';
import {
  addEvent,
  addTask,
  assignTask,
  deleteEvent,
  deleteTask,
  reorderTasks,
  saveRemarks,
  setTaskDone,
  updateEvent,
  updateTask,
  type ActionResult,
} from './actions';
import { EditableTitle } from './editable-title';
import { GlassPanel } from './glass-panel';
import { StaffingBoard } from './staffing-board';
import s from './tracker.module.scss';

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function fmtDate(
  key: string,
  locale: 'en' | 'zh-CN',
  opts: Intl.DateTimeFormatOptions,
): string {
  return new Intl.DateTimeFormat(locale, { timeZone: 'UTC', ...opts }).format(
    new Date(`${key}T00:00:00Z`),
  );
}

export function WorkTracker({
  initial,
  initialDay,
}: {
  initial: TrackerData;
  initialDay: string | null;
}) {
  const { t, locale } = useI18n();
  const tag = localeTag(locale);
  const router = useRouter();
  const [navPending, startNav] = useTransition();

  const { month, today } = initial;
  const tomorrow = addDays(today, 1);
  const [selected, setSelected] = useState(
    initialDay ?? (today.startsWith(month) ? today : `${month}-01`),
  );
  const [tasks, setTasks] = useState(initial.tasks);
  const [events, setEvents] = useState(initial.events);
  // Keyed per failure so a repeat of the same message restarts the timer.
  const [toast, setToast] = useState<{ id: number; message: string } | null>(
    null,
  );

  // Show a failure for a few seconds, then clear it.
  useEffect(() => {
    if (!toast) return;
    const id = window.setTimeout(() => setToast(null), 4000);
    return () => window.clearTimeout(id);
  }, [toast]);

  const fail = useCallback((r: ActionResult, rollback: () => void) => {
    rollback();
    setToast({
      id: Date.now(),
      message: r.message ?? 'Could not save. Try again.',
    });
  }, []);

  function gotoMonth(delta: number) {
    startNav(() => router.push(`?month=${addMonths(month, delta)}`));
  }

  function pickDay(key: string) {
    if (key.startsWith(month)) {
      setSelected(key);
      return;
    }
    startNav(() => router.push(`?month=${key.slice(0, 7)}&day=${key}`));
  }

  const eventsOn = (key: string) => events.filter((e) => e.date === key);
  const shootsOn = (key: string) =>
    initial.shoots.filter((s) => s.date === key);
  const postsOn = (key: string) => initial.posts.filter((p) => p.date === key);
  // Everything on a day, for the spotlight: events first (they are the
  // owner's), then shoots and posting slots by time, untimed last.
  const agendaOn = (key: string) => {
    const timed = [
      ...shootsOn(key).map((s) => ({
        id: `s-${s.id}`,
        time: s.time,
        label: [s.time, t('Shoot'), s.person, s.title]
          .filter(Boolean)
          .join(' · '),
      })),
      ...postsOn(key).map((p) => ({
        id: `p-${p.id}`,
        time: p.time,
        label: [p.time, t('Post'), p.account, p.title]
          .filter(Boolean)
          .join(' · '),
      })),
    ].sort((a, b) =>
      (a.time ?? '99:99') < (b.time ?? '99:99')
        ? -1
        : (a.time ?? '99:99') > (b.time ?? '99:99')
          ? 1
          : 0,
    );
    return [
      ...eventsOn(key).map((e) => ({ id: `e-${e.id}`, label: e.title })),
      ...timed,
    ];
  };

  return (
    <div className={cn(s.scene, 'min-h-screen')}>
      {/* Viewport-fixed so the lights fill the whole window, not the content
          column, and the animated area is one screen rather than the page. */}
      <AuroraBackground
        aria-hidden
        // Half-resolution, scaled 2x: the layer is blurred anyway, and the
        // per-frame repaint of the animation costs a quarter of the pixels.
        className="pointer-events-none fixed left-0 top-0 z-0 h-[50vh] w-[50vw] origin-top-left scale-[2] bg-transparent dark:bg-transparent"
      />
      <div className="relative z-10 mx-auto w-full max-w-[1320px] px-4 pb-24 pt-8 sm:px-6 md:px-8 md:pt-10">
        {/* Header */}
        <header className="mb-8 flex flex-col gap-4 md:mb-10 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="text-micro uppercase tracking-[0.14em] text-fg-subtle">
              {t('Admin console')}
            </p>
            <h1 className="mt-2 text-display-2 text-fg">
              {t('Work')}{' '}
              <span className="font-light text-fg-muted">{t('Tracker')}</span>
            </h1>
            <p className="mt-2 text-body text-fg-muted">
              {t('Plan the day, track events, and see who runs which account.')}
            </p>
          </div>
          <div className="text-left md:text-right">
            <p className="text-caption text-fg-subtle">{t('Today')}</p>
            <p className="text-subsection text-fg">
              {fmtDate(today, tag, {
                weekday: 'long',
                month: 'long',
                day: 'numeric',
                year: 'numeric',
              })}
            </p>
          </div>
        </header>

        {/* Spotlight: today + tomorrow */}
        <section
          aria-label={t('Upcoming')}
          className="mb-6 grid grid-cols-1 gap-4 md:grid-cols-2 md:gap-6"
        >
          {[today, tomorrow].map((key, i) => {
            const list = agendaOn(key);
            const isToday = i === 0;
            return (
              <GlassPanel
                key={key}
                accent={isToday}
                lens
                className="min-h-[132px] transition-transform duration-200 ease-out hover:-translate-y-0.5"
              >
                <button
                  type="button"
                  onClick={() => pickDay(key)}
                  className="flex flex-1 items-stretch gap-5 rounded-[inherit] p-5 text-left focus-visible:outline-none focus-visible:shadow-focus sm:p-6"
                >
                  <div className="flex w-16 shrink-0 flex-col items-center justify-center">
                    <span
                      className={clsx(
                        'text-metric-lg tnum leading-none',
                        isToday ? 'text-brand' : 'text-fg',
                      )}
                    >
                      {key.slice(8)}
                    </span>
                    <span className="mt-1.5 text-micro uppercase tracking-[0.12em] text-fg-subtle">
                      {fmtDate(key, tag, { weekday: 'short' })}
                    </span>
                  </div>
                  <div className="min-w-0 flex-1 border-l border-white/10 pl-5">
                    <p className="text-micro uppercase tracking-[0.14em] text-fg-subtle">
                      {isToday ? t('Today') : t('Tomorrow')}
                      <span className="ml-2 normal-case tracking-normal text-fg-muted">
                        {fmtDate(key, tag, { month: 'short', day: 'numeric' })}
                      </span>
                    </p>
                    {list.length === 0 ? (
                      <p className="mt-2 text-body text-fg-muted">
                        {t('Nothing scheduled.')}
                      </p>
                    ) : (
                      <ul className="mt-2 space-y-1.5">
                        {list.slice(0, 4).map((e) => (
                          <li
                            key={e.id}
                            className="flex items-start gap-2.5 text-body text-fg"
                          >
                            <span
                              aria-hidden
                              className={cn(
                                'mt-[9px] h-1.5 w-1.5 shrink-0 rounded-full',
                                isToday ? 'bg-brand' : 'bg-fg-muted',
                              )}
                            />
                            <span className="truncate">{e.label}</span>
                          </li>
                        ))}
                        {list.length > 4 ? (
                          <li className="text-caption text-fg-subtle">
                            {t('+{count} more', { count: list.length - 4 })}
                          </li>
                        ) : null}
                      </ul>
                    )}
                  </div>
                </button>
              </GlassPanel>
            );
          })}
        </section>

        {/* Calendar · Tasks */}
        <section className="grid grid-cols-1 gap-4 md:gap-6 lg:grid-cols-12">
          <GlassPanel className="p-5 sm:p-6 lg:col-span-7">
            <div className="mb-5 flex items-center justify-between gap-3">
              <h2 className="text-heading text-fg">{t('Calendar')}</h2>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => gotoMonth(-1)}
                  disabled={navPending}
                  aria-label={t('Previous month')}
                  className={cn(
                    s.pill,
                    'flex h-9 w-9 items-center justify-center text-fg disabled:opacity-50',
                  )}
                >
                  <Chevron dir="left" />
                </button>
                <span className="min-w-[150px] text-center text-label text-fg">
                  {fmtDate(`${month}-01`, tag, {
                    month: 'long',
                    year: 'numeric',
                  })}
                </span>
                <button
                  type="button"
                  onClick={() => gotoMonth(1)}
                  disabled={navPending}
                  aria-label={t('Next month')}
                  className={cn(
                    s.pill,
                    'flex h-9 w-9 items-center justify-center text-fg disabled:opacity-50',
                  )}
                >
                  <Chevron dir="right" />
                </button>
              </div>
            </div>

            <div
              aria-label={t('Calendar')}
              className={cn(
                'grid grid-cols-7 gap-1.5',
                navPending && 'opacity-60',
              )}
            >
              {WEEKDAYS.map((d) => (
                <div
                  key={d}
                  className="pb-1 text-center text-micro uppercase tracking-[0.12em] text-fg-subtle"
                >
                  {t(d)}
                </div>
              ))}
              {monthGrid(month)
                .flat()
                .map((key, i) =>
                  key === null ? (
                    <div key={`empty-${i}`} aria-hidden />
                  ) : (
                    <DayCell
                      key={key}
                      dateKey={key}
                      isToday={key === today}
                      isSelected={key === selected}
                      count={
                        eventsOn(key).length +
                        shootsOn(key).length +
                        postsOn(key).length
                      }
                      onPick={() => setSelected(key)}
                    />
                  ),
                )}
            </div>
          </GlassPanel>

          <TasksPanel
            tasks={tasks}
            setTasks={setTasks}
            members={initial.members}
            onFail={fail}
          />
        </section>

        {/* Events for day · Remarks */}
        <section className="mt-4 grid grid-cols-1 gap-4 md:mt-6 md:gap-6 lg:grid-cols-12">
          <EventsPanel
            dateKey={selected}
            label={fmtDate(selected, tag, {
              weekday: 'long',
              month: 'long',
              day: 'numeric',
            })}
            events={eventsOn(selected)}
            shoots={shootsOn(selected)}
            posts={postsOn(selected)}
            setEvents={setEvents}
            onFail={fail}
          />
          <RemarksPanel initial={initial.remarks} onFail={fail} />
        </section>

        {/* Staffing */}
        <section className="mt-4 md:mt-6">
          <StaffingBoard
            monthLabel={fmtDate(`${month}-01`, tag, {
              month: 'long',
              year: 'numeric',
            })}
            members={initial.members}
            creators={initial.creators}
            onFail={fail}
          />
        </section>
      </div>

      {toast ? (
        // Pinned by this wrapper: the glass sets its own inline
        // `position: relative`, which beats a `fixed` class on it.
        <div className="fixed bottom-5 left-1/2 z-50 -translate-x-1/2">
          <GlassPanel role="status" lens className="px-5 py-3 text-body-sm">
            {t(toast.message)}
          </GlassPanel>
        </div>
      ) : null}
    </div>
  );
}

function Chevron({ dir }: { dir: 'left' | 'right' }) {
  return (
    <svg viewBox="0 0 16 16" aria-hidden className="h-4 w-4">
      <path
        d={dir === 'left' ? 'M10 3 5 8l5 5' : 'M6 3l5 5-5 5'}
        fill="none"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function DayCell({
  dateKey,
  isToday,
  isSelected,
  count,
  onPick,
}: {
  dateKey: string;
  isToday: boolean;
  isSelected: boolean;
  count: number;
  onPick: () => void;
}) {
  const { t } = useI18n();
  return (
    <button
      type="button"
      aria-pressed={isSelected}
      aria-current={isToday ? 'date' : undefined}
      onClick={onPick}
      className={clsx(
        s.inset,
        s.insetHover,
        'relative flex aspect-square flex-col items-center justify-center text-label focus-visible:outline-none focus-visible:shadow-focus sm:aspect-[1.35]',
        isSelected && '!border-brand/60 !bg-brand/15',
        isToday && !isSelected && s.today,
      )}
    >
      <span className={cn('tnum', isToday && 'text-brand')}>
        {Number(dateKey.slice(8))}
      </span>
      {count > 0 ? (
        <span
          aria-label={t('{count} items', { count })}
          className="absolute bottom-1.5 flex gap-0.5"
        >
          {Array.from({ length: Math.min(count, 3) }).map((_, i) => (
            <span key={i} className="h-1 w-1 rounded-full bg-brand" />
          ))}
        </span>
      ) : null}
    </button>
  );
}

// ---- tasks -----------------------------------------------------------------

function TasksPanel({
  tasks,
  setTasks,
  members,
  onFail,
}: {
  tasks: TrackerTask[];
  setTasks: (f: (prev: TrackerTask[]) => TrackerTask[]) => void;
  /** Who a task can be given to; they see it in the staff portal. */
  members: TrackerMember[];
  onFail: (r: ActionResult, rollback: () => void) => void;
}) {
  const { t } = useI18n();
  const inputId = useId();
  const [draft, setDraft] = useState('');
  const [dragFrom, setDragFrom] = useState<number | null>(null);
  const [over, setOver] = useState<number | null>(null);
  // The row being renamed is not draggable: selecting text in its input
  // would otherwise pick up the whole row.
  const [editingId, setEditingId] = useState<string | null>(null);

  const open = tasks.filter((x) => !x.done);
  const done = tasks.filter((x) => x.done);

  async function submit(e: FormEvent) {
    e.preventDefault();
    const title = draft.trim();
    if (!title) return;
    const tempId = `temp-${Date.now()}`;
    const temp: TrackerTask = {
      id: tempId,
      title,
      done: false,
      sortOrder: 1e9,
      assigneeId: null,
    };
    setDraft('');
    setTasks((p) => [...p, temp]);
    const r = await addTask(title);
    if (!r.ok || !r.id) {
      onFail(r, () => setTasks((p) => p.filter((x) => x.id !== tempId)));
      return;
    }
    setTasks((p) => p.map((x) => (x.id === tempId ? { ...x, id: r.id! } : x)));
  }

  // Items still waiting for their server id cannot be acted on yet.
  const isTemp = (id: string) => id.startsWith('temp-');

  async function toggle(task: TrackerTask) {
    if (isTemp(task.id)) return;
    const next = !task.done;
    setTasks((p) =>
      p.map((x) => (x.id === task.id ? { ...x, done: next } : x)),
    );
    const r = await setTaskDone(task.id, next);
    if (!r.ok)
      onFail(r, () =>
        setTasks((p) =>
          p.map((x) => (x.id === task.id ? { ...x, done: !next } : x)),
        ),
      );
  }

  async function assign(task: TrackerTask, assigneeId: string | null) {
    if (isTemp(task.id) || task.assigneeId === assigneeId) return;
    const prev = task.assigneeId;
    setTasks((p) =>
      p.map((x) => (x.id === task.id ? { ...x, assigneeId } : x)),
    );
    const r = await assignTask(task.id, assigneeId);
    if (!r.ok)
      onFail(r, () =>
        setTasks((p) =>
          p.map((x) =>
            x.id === task.id && x.assigneeId === assigneeId
              ? { ...x, assigneeId: prev }
              : x,
          ),
        ),
      );
  }

  async function rename(task: TrackerTask, title: string) {
    if (isTemp(task.id)) return;
    const prev = task.title;
    setTasks((p) => p.map((x) => (x.id === task.id ? { ...x, title } : x)));
    const r = await updateTask(task.id, title);
    if (!r.ok)
      onFail(r, () =>
        setTasks((p) =>
          p.map((x) =>
            x.id === task.id && x.title === title ? { ...x, title: prev } : x,
          ),
        ),
      );
  }

  async function remove(task: TrackerTask) {
    if (isTemp(task.id)) return;
    const at = tasks.findIndex((x) => x.id === task.id);
    setTasks((p) => p.filter((x) => x.id !== task.id));
    const r = await deleteTask(task.id);
    // Put back just this item, where it was — never a whole stale snapshot.
    if (!r.ok)
      onFail(r, () =>
        setTasks((p) => {
          if (p.some((x) => x.id === task.id)) return p;
          const next = p.slice();
          next.splice(Math.min(at, next.length), 0, task);
          return next;
        }),
      );
  }

  function drop(to: number) {
    if (dragFrom === null) return;
    const reordered = reorder(open, dragFrom, to);
    setDragFrom(null);
    setOver(null);
    if (reordered === open) return;
    const wasAt = new Map(open.map((x, i) => [x.id, i]));
    setTasks((p) => [...reordered, ...p.filter((x) => x.done)]);
    // Only open tasks carry an order; finished ones sit in their own list.
    const ids = reordered.filter((x) => !isTemp(x.id)).map((x) => x.id);
    void reorderTasks(ids).then((r) => {
      if (!r.ok)
        onFail(r, () =>
          setTasks((p) => [
            ...p
              .filter((x) => !x.done)
              .sort(
                (a, b) => (wasAt.get(a.id) ?? 1e9) - (wasAt.get(b.id) ?? 1e9),
              ),
            ...p.filter((x) => x.done),
          ]),
        );
    });
  }

  return (
    <GlassPanel className="p-5 sm:p-6 lg:col-span-5">
      <div className="mb-4 flex items-baseline justify-between gap-3">
        <h2 className="text-heading text-fg">{t('Job tasks')}</h2>
        <span className="text-caption tnum text-fg-subtle">
          {t('{open} open · {done} done', {
            open: open.length,
            done: done.length,
          })}
        </span>
      </div>

      <form onSubmit={submit} className="mb-4 flex gap-2">
        <label htmlFor={inputId} className="sr-only">
          {t('New task')}
        </label>
        <input
          id={inputId}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          maxLength={200}
          // Chrome would otherwise offer every task ever typed here in a
          // popup under the field.
          autoComplete="off"
          placeholder={t('What needs to be done?')}
          className={cn(s.field, 'h-11 flex-1 px-4 text-body')}
        />
        <button
          type="submit"
          disabled={!draft.trim()}
          aria-label={t('Add task')}
          className={cn(
            s.pill,
            s.pillBrand,
            'flex h-11 w-11 shrink-0 items-center justify-center disabled:opacity-40',
          )}
        >
          <Plus />
        </button>
      </form>

      {tasks.length === 0 ? (
        <p className="py-6 text-center text-body text-fg-muted">
          {t('No pending tasks. Enjoy the quiet.')}
        </p>
      ) : (
        <ul className="space-y-2">
          {open.map((task, i) => (
            <li
              key={task.id}
              draggable={editingId !== task.id}
              onDragStart={(e) => {
                setDragFrom(i);
                e.dataTransfer.effectAllowed = 'move';
                e.dataTransfer.setData('text/plain', task.id);
              }}
              onDragOver={(e) => {
                if (dragFrom === null) return;
                e.preventDefault();
                e.dataTransfer.dropEffect = 'move';
                if (over !== i) setOver(i);
              }}
              onDragLeave={(e) => {
                // Children fire leave too; only a real exit clears the target.
                if (!e.currentTarget.contains(e.relatedTarget as Node | null))
                  setOver((o) => (o === i ? null : o));
              }}
              onDrop={(e) => {
                e.preventDefault();
                drop(i);
              }}
              onDragEnd={() => {
                setDragFrom(null);
                setOver(null);
              }}
              className={cn(
                s.inset,
                'flex items-center gap-3 px-3 py-2.5',
                dragFrom === i && s.dragging,
                over === i &&
                  dragFrom !== null &&
                  dragFrom !== i &&
                  s.dropTarget,
              )}
            >
              <span
                aria-hidden
                className="cursor-grab text-fg-subtle active:cursor-grabbing"
                title={t('Drag to reorder')}
              >
                <Grip />
              </span>
              <TaskRow
                task={task}
                onToggle={() => toggle(task)}
                onRemove={() => remove(task)}
                onRename={(title) => rename(task, title)}
                members={members}
                onAssign={(id) => assign(task, id)}
                onEditingChange={(on) =>
                  setEditingId((cur) =>
                    on ? task.id : cur === task.id ? null : cur,
                  )
                }
              />
            </li>
          ))}
          {done.map((task) => (
            <li
              key={task.id}
              className={cn(
                s.inset,
                'flex items-center gap-3 px-3 py-2.5 opacity-60',
              )}
            >
              <span aria-hidden className="w-4" />
              <TaskRow
                task={task}
                onToggle={() => toggle(task)}
                onRemove={() => remove(task)}
              />
            </li>
          ))}
        </ul>
      )}
    </GlassPanel>
  );
}

function TaskRow({
  task,
  onToggle,
  onRemove,
  onRename,
  onEditingChange,
  members,
  onAssign,
}: {
  task: TrackerTask;
  onToggle: () => void;
  onRemove: () => void;
  /** Open tasks only; a finished task keeps its title. */
  onRename?: (title: string) => void;
  onEditingChange?: (editing: boolean) => void;
  /** Open tasks only: who it is given to. */
  members?: TrackerMember[];
  onAssign?: (memberId: string | null) => void;
}) {
  const { t } = useI18n();
  return (
    <>
      <button
        type="button"
        role="checkbox"
        aria-checked={task.done}
        aria-label={task.title}
        onClick={onToggle}
        className={cn(
          'flex h-5 w-5 shrink-0 items-center justify-center rounded-full border transition-colors duration-150',
          task.done
            ? 'border-brand bg-brand text-fg-on-brand'
            : 'border-white/25 hover:border-brand/70',
        )}
      >
        {task.done ? (
          <svg viewBox="0 0 12 12" className="h-3 w-3" aria-hidden>
            <path
              d="m2.5 6.2 2.2 2.2 4.8-4.9"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        ) : null}
      </button>
      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 items-center gap-1">
          {onRename ? (
            <EditableTitle
              value={task.title}
              onSave={onRename}
              onEditingChange={onEditingChange}
              editLabel={t('Edit task')}
              inputLabel={t('Task title')}
              className="min-w-0 flex-1 truncate text-body text-fg"
            />
          ) : (
            <span
              className={clsx(
                'min-w-0 flex-1 truncate text-body',
                task.done ? 'line-through text-fg-muted' : 'text-fg',
              )}
            >
              {task.title}
            </span>
          )}
        </div>
        {/* Under the title rather than beside it: the owner's tasks are long
            and a select in the row would cut them to a few words. */}
        {members && onAssign ? (
          <select
            value={task.assigneeId ?? ''}
            onChange={(e) => onAssign(e.target.value || null)}
            aria-label={t('Give {title} to', { title: task.title })}
            className={cn(s.field, 'mt-1.5 h-7 max-w-full px-2 text-caption')}
          >
            <option value="">{t('Not given to anyone')}</option>
            {members.map((m) => (
              <option key={m.id} value={m.id}>
                {t('For: {name}', { name: m.name })}
              </option>
            ))}
          </select>
        ) : null}
      </div>
      <button
        type="button"
        onClick={onRemove}
        aria-label={t('Delete task')}
        className="rounded-full p-1 text-fg-subtle transition-colors hover:text-fg"
      >
        <Cross />
      </button>
    </>
  );
}

// ---- events ----------------------------------------------------------------

function EventsPanel({
  dateKey,
  label,
  events,
  shoots,
  posts,
  setEvents,
  onFail,
}: {
  dateKey: string;
  label: string;
  events: TrackerEvent[];
  /** The staff portal's shoots and posting slots that day (read-only here). */
  shoots: TrackerShoot[];
  posts: TrackerPost[];
  setEvents: (f: (prev: TrackerEvent[]) => TrackerEvent[]) => void;
  onFail: (r: ActionResult, rollback: () => void) => void;
}) {
  const { t } = useI18n();
  const inputId = useId();
  const [draft, setDraft] = useState('');

  async function submit(e: FormEvent) {
    e.preventDefault();
    const title = draft.trim();
    if (!title) return;
    const tempId = `temp-${Date.now()}`;
    setDraft('');
    setEvents((p) => [...p, { id: tempId, date: dateKey, title }]);
    const r = await addEvent(dateKey, title);
    if (!r.ok || !r.id) {
      onFail(r, () => setEvents((p) => p.filter((x) => x.id !== tempId)));
      return;
    }
    setEvents((p) => p.map((x) => (x.id === tempId ? { ...x, id: r.id! } : x)));
  }

  async function rename(ev: TrackerEvent, title: string) {
    if (ev.id.startsWith('temp-')) return;
    const prev = ev.title;
    setEvents((p) => p.map((x) => (x.id === ev.id ? { ...x, title } : x)));
    const r = await updateEvent(ev.id, title);
    if (!r.ok)
      onFail(r, () =>
        setEvents((p) =>
          p.map((x) =>
            x.id === ev.id && x.title === title ? { ...x, title: prev } : x,
          ),
        ),
      );
  }

  async function remove(ev: TrackerEvent) {
    if (ev.id.startsWith('temp-')) return;
    // The same-day neighbour that followed it, so a rollback lands it back in
    // place rather than at the end of the day's list.
    const after = events[events.findIndex((x) => x.id === ev.id) + 1]?.id;
    setEvents((p) => p.filter((x) => x.id !== ev.id));
    const r = await deleteEvent(ev.id);
    if (!r.ok)
      onFail(r, () =>
        setEvents((p) => {
          if (p.some((x) => x.id === ev.id)) return p;
          const at = after ? p.findIndex((x) => x.id === after) : -1;
          const next = p.slice();
          next.splice(at === -1 ? next.length : at, 0, ev);
          return next;
        }),
      );
  }

  return (
    <GlassPanel className="p-5 sm:p-6 lg:col-span-7">
      <div className="mb-4">
        <p className="text-micro uppercase tracking-[0.14em] text-fg-subtle">
          {t('Events for')}
        </p>
        <h2 className="mt-1 text-heading text-fg">{label}</h2>
      </div>

      <form onSubmit={submit} className="mb-4 flex gap-2">
        <label htmlFor={inputId} className="sr-only">
          {t('New event')}
        </label>
        <input
          id={inputId}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          maxLength={200}
          autoComplete="off"
          placeholder={t('Add an important event…')}
          className={cn(s.field, 'h-11 flex-1 px-4 text-body')}
        />
        <button
          type="submit"
          disabled={!draft.trim()}
          className={cn(
            s.pill,
            s.pillBrand,
            'h-11 px-5 text-label disabled:opacity-40',
          )}
        >
          {t('Add')}
        </button>
      </form>

      {events.length === 0 ? (
        <p className="py-4 text-body text-fg-muted">
          {t('No events on this day.')}
        </p>
      ) : (
        <ul className="space-y-2">
          {events.map((ev) => (
            <li
              key={ev.id}
              className={cn(s.inset, 'flex items-center gap-3 px-4 py-3')}
            >
              <span
                aria-hidden
                className="h-2 w-2 shrink-0 rounded-full bg-brand"
              />
              <EditableTitle
                value={ev.title}
                onSave={(title) => rename(ev, title)}
                editLabel={t('Edit event')}
                inputLabel={t('Event title')}
                className="min-w-0 flex-1 break-words text-body text-fg"
              />
              <button
                type="button"
                onClick={() => remove(ev)}
                aria-label={t('Delete event')}
                className="rounded-full p-1 text-fg-subtle transition-colors hover:text-fg"
              >
                <Cross />
              </button>
            </li>
          ))}
        </ul>
      )}

      {shoots.length > 0 ? (
        <DayList
          title={t('Shoots')}
          items={shoots.map((x) => ({
            id: x.id,
            time: x.time,
            main: x.title,
            meta: x.person,
            muted: x.status === 'done',
            badge: x.status === 'done' ? t('Done') : null,
          }))}
        />
      ) : null}
      {posts.length > 0 ? (
        <DayList
          title={t('Going out')}
          items={posts.map((x) => ({
            id: x.id,
            time: x.time,
            main: x.title,
            meta: [x.account, x.person].filter(Boolean).join(' · '),
            muted: x.posted,
            badge: x.posted ? t('Done') : null,
          }))}
        />
      ) : null}
    </GlassPanel>
  );
}

/** A read-only list under the day's events: shoots, or posting slots. */
function DayList({
  title,
  items,
}: {
  title: string;
  items: {
    id: string;
    time: string | null;
    main: string;
    meta: string;
    muted: boolean;
    badge: string | null;
  }[];
}) {
  return (
    <div className="mt-5">
      <p className="mb-2 text-micro uppercase tracking-[0.14em] text-fg-subtle">
        {title}
      </p>
      <ul className="space-y-2">
        {items.map((x) => (
          <li
            key={x.id}
            className={cn(s.inset, 'flex items-start gap-3 px-4 py-2.5')}
          >
            <span className="w-11 shrink-0 pt-0.5 text-caption tnum text-fg-muted">
              {x.time ?? '—'}
            </span>
            <span className="min-w-0 flex-1">
              <span
                className={
                  x.muted
                    ? 'block break-words text-body text-fg-muted'
                    : 'block break-words text-body text-fg'
                }
              >
                {x.main}
              </span>
              {x.meta ? (
                <span className="block text-caption text-fg-subtle">
                  {x.meta}
                </span>
              ) : null}
            </span>
            {x.badge ? (
              <span className="shrink-0 text-caption text-fg-muted">
                {x.badge}
              </span>
            ) : null}
          </li>
        ))}
      </ul>
    </div>
  );
}

// ---- remarks ---------------------------------------------------------------

function RemarksPanel({
  initial,
  onFail,
}: {
  initial: string;
  onFail: (r: ActionResult, rollback: () => void) => void;
}) {
  const { t } = useI18n();
  const id = useId();
  const [value, setValue] = useState(initial);
  const [state, setState] = useState<'idle' | 'dirty' | 'saving' | 'saved'>(
    'idle',
  );
  const latest = useRef(initial);
  const lastSaved = useRef(initial);
  const inFlight = useRef(false);

  // One save at a time, always of the newest text; a save that lands on
  // already-stale text starts the next one. A failed save never rewinds the
  // textarea — the words stay and the status says so.
  const flush = useCallback(
    async function run(): Promise<void> {
      if (inFlight.current) return;
      const v = latest.current;
      if (v === lastSaved.current) return;
      inFlight.current = true;
      setState('saving');
      const r = await saveRemarks(v);
      inFlight.current = false;
      if (r.ok) {
        lastSaved.current = v;
        if (latest.current === v) setState('saved');
        else void run();
      } else {
        setState('dirty');
        onFail(r, () => {});
      }
    },
    [onFail],
  );

  // The debounce lives in an effect; the 'dirty' flag is set by the change
  // handler so the effect body never calls setState itself.
  useEffect(() => {
    if (value === lastSaved.current) return;
    const timer = window.setTimeout(() => void flush(), 800);
    return () => window.clearTimeout(timer);
  }, [value, flush]);

  // Month navigation remounts the board: send whatever is still pending.
  useEffect(() => () => void flush(), [flush]);

  const status =
    state === 'saving'
      ? t('Saving…')
      : state === 'saved'
        ? t('Saved')
        : state === 'dirty'
          ? t('Unsaved')
          : t('Autosaves');

  return (
    <GlassPanel className="p-5 sm:p-6 lg:col-span-5">
      <div className="mb-4 flex items-baseline justify-between gap-3">
        <h2 className="text-heading text-fg">{t('Remarks')}</h2>
        <span
          className={clsx(
            'text-caption',
            state === 'saved' ? 'text-brand' : 'text-fg-subtle',
          )}
          aria-live="polite"
        >
          {status}
        </span>
      </div>
      <label htmlFor={id} className="sr-only">
        {t('Remarks')}
      </label>
      <textarea
        id={id}
        value={value}
        onChange={(e) => {
          setValue(e.target.value);
          latest.current = e.target.value;
          setState('dirty');
        }}
        maxLength={20000}
        rows={8}
        placeholder={t(
          'Notes, reminders, anything for the team. Saves by itself.',
        )}
        className={cn(
          s.field,
          'min-h-[200px] flex-1 resize-y px-4 py-3 text-body leading-relaxed',
        )}
      />
    </GlassPanel>
  );
}

// ---- glyphs ----------------------------------------------------------------

function Plus() {
  return (
    <svg viewBox="0 0 16 16" aria-hidden className="h-4 w-4">
      <path
        d="M8 3v10M3 8h10"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
      />
    </svg>
  );
}

function Cross() {
  return (
    <svg viewBox="0 0 16 16" aria-hidden className="h-3.5 w-3.5">
      <path
        d="m4 4 8 8M12 4l-8 8"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
      />
    </svg>
  );
}

function Grip() {
  return (
    <svg viewBox="0 0 16 16" aria-hidden className="h-4 w-4">
      {[4, 8, 12].map((y) => (
        <g key={y}>
          <circle cx="6" cy={y} r="1.1" fill="currentColor" />
          <circle cx="10" cy={y} r="1.1" fill="currentColor" />
        </g>
      ))}
    </svg>
  );
}
