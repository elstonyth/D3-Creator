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
import { localeTag } from '@gitroom/frontend/lib/i18n';
import {
  addDays,
  addMonths,
  monthGrid,
  reorder,
  type TrackerData,
  type TrackerEvent,
  type TrackerTask,
} from '@gitroom/frontend/lib/tracker';
import {
  addEvent,
  addTask,
  deleteEvent,
  deleteTask,
  reorderTasks,
  saveRemarks,
  setTaskDone,
  type ActionResult,
} from './actions';
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
  const [toast, setToast] = useState<string | null>(null);

  // Show a failure for a few seconds, then clear it.
  useEffect(() => {
    if (!toast) return;
    const id = window.setTimeout(() => setToast(null), 4000);
    return () => window.clearTimeout(id);
  }, [toast]);

  const fail = useCallback(
    (r: ActionResult, rollback: () => void) => {
      rollback();
      setToast(r.message ?? t('Could not save. Try again.'));
    },
    [t],
  );

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
            const list = eventsOn(key);
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
                      className={cn(
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
                            <span className="truncate">{e.title}</span>
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
              role="grid"
              aria-label={t('Calendar')}
              className={cn(
                'grid grid-cols-7 gap-1.5',
                navPending && 'opacity-60',
              )}
            >
              {WEEKDAYS.map((d) => (
                <div
                  key={d}
                  role="columnheader"
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
                      count={eventsOn(key).length}
                      onPick={() => setSelected(key)}
                    />
                  ),
                )}
            </div>
          </GlassPanel>

          <TasksPanel tasks={tasks} setTasks={setTasks} onFail={fail} />
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
            setEvents={setEvents}
            onFail={fail}
          />
          <RemarksPanel initial={initial.remarks} onFail={fail} />
        </section>

        {/* Staffing */}
        <section className="mt-4 md:mt-6">
          <StaffingBoard
            month={month}
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
        <GlassPanel
          role="status"
          lens
          className="fixed bottom-5 left-1/2 z-50 -translate-x-1/2 px-5 py-3 text-body-sm text-fg"
        >
          {toast}
        </GlassPanel>
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
  return (
    <button
      type="button"
      role="gridcell"
      aria-selected={isSelected}
      aria-current={isToday ? 'date' : undefined}
      onClick={onPick}
      className={cn(
        s.inset,
        s.insetHover,
        'relative flex aspect-square flex-col items-center justify-center text-label text-fg focus-visible:outline-none focus-visible:shadow-focus sm:aspect-[1.35]',
        isSelected && '!border-brand/60 !bg-brand/15',
        isToday && !isSelected && 'ring-1 ring-inset ring-brand/50',
      )}
    >
      <span className={cn('tnum', isToday && 'text-brand')}>
        {Number(dateKey.slice(8))}
      </span>
      {count > 0 ? (
        <span
          aria-label={`${count} events`}
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
  onFail,
}: {
  tasks: TrackerTask[];
  setTasks: (f: (prev: TrackerTask[]) => TrackerTask[]) => void;
  onFail: (r: ActionResult, rollback: () => void) => void;
}) {
  const { t } = useI18n();
  const inputId = useId();
  const [draft, setDraft] = useState('');
  const [dragFrom, setDragFrom] = useState<number | null>(null);
  const [over, setOver] = useState<number | null>(null);

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

  async function toggle(task: TrackerTask) {
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

  async function remove(task: TrackerTask) {
    const before = tasks;
    setTasks((p) => p.filter((x) => x.id !== task.id));
    const r = await deleteTask(task.id);
    if (!r.ok) onFail(r, () => setTasks(() => before));
  }

  function drop(to: number) {
    if (dragFrom === null) return;
    const reordered = reorder(open, dragFrom, to);
    setDragFrom(null);
    setOver(null);
    if (reordered === open) return;
    const before = tasks;
    const next = [...reordered, ...done];
    setTasks(() => next);
    void reorderTasks(next.map((x) => x.id)).then((r) => {
      if (!r.ok) onFail(r, () => setTasks(() => before));
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
              draggable
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
              onDragLeave={() => setOver((o) => (o === i ? null : o))}
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
}: {
  task: TrackerTask;
  onToggle: () => void;
  onRemove: () => void;
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
      <span
        className={cn(
          'min-w-0 flex-1 truncate text-body text-fg',
          task.done && 'line-through text-fg-muted',
        )}
      >
        {task.title}
      </span>
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
  setEvents,
  onFail,
}: {
  dateKey: string;
  label: string;
  events: TrackerEvent[];
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

  async function remove(ev: TrackerEvent) {
    setEvents((p) => p.filter((x) => x.id !== ev.id));
    const r = await deleteEvent(ev.id);
    if (!r.ok) onFail(r, () => setEvents((p) => [...p, ev]));
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
              <span className="min-w-0 flex-1 text-body text-fg">
                {ev.title}
              </span>
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
    </GlassPanel>
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
  const lastSaved = useRef(initial);

  // The debounce lives in an effect; the 'dirty' flag is set by the change
  // handler so the effect body never calls setState itself.
  useEffect(() => {
    if (value === lastSaved.current) return;
    const timer = window.setTimeout(async () => {
      setState('saving');
      const r = await saveRemarks(value);
      if (r.ok) {
        lastSaved.current = value;
        setState('saved');
      } else {
        const prev = lastSaved.current;
        onFail(r, () => setValue(prev));
        setState('idle');
      }
    }, 800);
    return () => window.clearTimeout(timer);
  }, [value, onFail]);

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
          className={cn(
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
