'use client';

/**
 * The work trackers' shared look. The staff portal's home and the admin
 * console's /tracker are built from these pieces so they read as one board:
 * the aurora scene and header, the today / tomorrow spotlight, the month
 * calendar and the stat tiles. What goes in them is each tracker's own.
 *
 * Month navigation reloads the page with ?month= (the page keys its tracker
 * on the month, so state resets cleanly); a day inside the month is local.
 */

import { useState, useTransition, type ReactNode } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useI18n } from '@gitroom/frontend/components/i18n/locale-provider';
import { AuroraBackground } from '@gitroom/frontend/components/ui/aurora-background';
import { localeTag } from '@gitroom/frontend/lib/i18n';
import { addMonths, monthGrid } from '@gitroom/frontend/lib/tracker';
import { cn } from '@gitroom/frontend/lib/utils';
// clsx where a custom font-size token sits next to a text colour:
// tailwind-merge reads `text-label` / `text-metric-lg` as colours and
// would drop them in favour of the colour.
import clsx from 'clsx';
import { GlassPanel } from './glass-panel';
import s from './tracker.module.scss';

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export function fmtDate(
  key: string,
  tag: 'en' | 'zh-CN',
  opts: Intl.DateTimeFormatOptions,
): string {
  return new Intl.DateTimeFormat(tag, { timeZone: 'UTC', ...opts }).format(
    new Date(`${key}T00:00:00Z`),
  );
}

/**
 * The day picked on the calendar, and moving between months. Picking a day
 * in another month (a spotlight card on the 30th) opens that month on it.
 * Other query parameters are kept (the dev preview's ?view=).
 */
export function useTrackerNav(
  month: string,
  today: string,
  initialDay: string | null,
) {
  const router = useRouter();
  const params = useSearchParams();
  const [pending, startNav] = useTransition();
  const [selected, setSelected] = useState(
    initialDay ?? (today.startsWith(month) ? today : `${month}-01`),
  );

  function go(m: string, day: string | null) {
    const q = new URLSearchParams(params?.toString());
    q.set('month', m);
    if (day) q.set('day', day);
    else q.delete('day');
    // Relative to the page as the browser sees it: on the portal hosts the
    // path is rewritten, so this never spells it.
    startNav(() => router.push(`?${q}`));
  }

  return {
    selected,
    pending,
    pick(key: string) {
      if (key.startsWith(month)) setSelected(key);
      else go(key.slice(0, 7), key);
    },
    gotoMonth(delta: number) {
      go(addMonths(month, delta), null);
    },
  };
}

/** The aurora backdrop, the page column and its header. */
export function TrackerScene({
  eyebrow,
  subline,
  today,
  children,
}: {
  eyebrow: string;
  subline: string;
  today: string;
  children: ReactNode;
}) {
  const { t, locale } = useI18n();
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
        <header className="mb-8 flex flex-col gap-4 md:mb-10 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="text-micro uppercase tracking-[0.14em] text-fg-subtle">
              {eyebrow}
            </p>
            <h1 className="mt-2 text-display-2 text-fg">
              {t('Work')}{' '}
              <span className="font-light text-fg-muted">{t('Tracker')}</span>
            </h1>
            <p className="mt-2 text-body text-fg-muted">{subline}</p>
          </div>
          <div className="text-left md:text-right">
            <p className="text-caption text-fg-subtle">{t('Today')}</p>
            <p className="text-subsection text-fg">
              {fmtDate(today, localeTag(locale), {
                weekday: 'long',
                month: 'long',
                day: 'numeric',
                year: 'numeric',
              })}
            </p>
          </div>
        </header>
        {children}
      </div>
    </div>
  );
}

export interface SpotDay {
  key: string;
  /** One line per thing that day, already worded. */
  items: { id: string; label: string }[];
  /** A line under the list (today's queue), if any. */
  note?: string | null;
}

/** Today and tomorrow as the two big cards; a click opens that day. */
export function Spotlight({
  days,
  today,
  onPick,
}: {
  days: SpotDay[];
  today: string;
  onPick: (key: string) => void;
}) {
  const { t, locale } = useI18n();
  const tag = localeTag(locale);
  return (
    <section
      aria-label={t('Upcoming')}
      className="mb-4 grid grid-cols-1 gap-4 md:mb-6 md:grid-cols-2 md:gap-6"
    >
      {days.map(({ key, items, note }) => {
        const isToday = key === today;
        return (
          <GlassPanel
            key={key}
            accent={isToday}
            lens
            className="min-h-[132px] transition-transform duration-200 ease-out hover:-translate-y-0.5"
          >
            <button
              type="button"
              onClick={() => onPick(key)}
              className="flex flex-1 items-stretch gap-4 rounded-[inherit] p-5 text-left focus-visible:outline-none focus-visible:shadow-focus sm:gap-5 sm:p-6"
            >
              <div className="flex w-12 shrink-0 flex-col items-center justify-center sm:w-16">
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
              <div className="min-w-0 flex-1 border-l border-white/10 pl-4 sm:pl-5">
                <p className="text-micro uppercase tracking-[0.14em] text-fg-subtle">
                  {isToday ? t('Today') : t('Tomorrow')}
                  <span className="ml-2 normal-case tracking-normal text-fg-muted">
                    {fmtDate(key, tag, { month: 'short', day: 'numeric' })}
                  </span>
                </p>
                {items.length === 0 ? (
                  <p className="mt-2 text-body text-fg-muted">
                    {t('Nothing planned.')}
                  </p>
                ) : (
                  <ul className="mt-2 space-y-1.5">
                    {items.slice(0, 4).map((e) => (
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
                        <span className="min-w-0 break-words">{e.label}</span>
                      </li>
                    ))}
                    {items.length > 4 ? (
                      <li className="text-caption text-fg-subtle">
                        {t('+{count} more', { count: items.length - 4 })}
                      </li>
                    ) : null}
                  </ul>
                )}
                {note ? (
                  <p className="mt-3 text-caption text-fg-muted">{note}</p>
                ) : null}
              </div>
            </button>
          </GlassPanel>
        );
      })}
    </section>
  );
}

/** The month grid; `counts` puts dots on the days that have something. */
export function TrackerCalendar({
  month,
  today,
  selected,
  counts,
  pending,
  onPick,
  onMonth,
  className,
}: {
  month: string;
  today: string;
  selected: string;
  counts: Record<string, number>;
  /** A month change is on its way. */
  pending: boolean;
  onPick: (key: string) => void;
  onMonth: (delta: number) => void;
  className?: string;
}) {
  const { t, locale } = useI18n();
  return (
    <GlassPanel className={cn('p-4 sm:p-6', className)}>
      {/* Wraps rather than overflowing on the narrowest phones (320px): the
          month switcher drops under the title, still on the right. */}
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-heading text-fg">{t('Calendar')}</h2>
        <div className="ml-auto flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => onMonth(-1)}
            disabled={pending}
            aria-label={t('Previous month')}
            className={cn(
              s.pill,
              'flex h-9 w-9 items-center justify-center text-fg focus-visible:outline-none focus-visible:shadow-focusRing disabled:opacity-50',
            )}
          >
            <Chevron dir="left" />
          </button>
          <span className="min-w-[120px] text-center text-label text-fg sm:min-w-[150px]">
            {fmtDate(`${month}-01`, localeTag(locale), {
              month: 'long',
              year: 'numeric',
            })}
          </span>
          <button
            type="button"
            onClick={() => onMonth(1)}
            disabled={pending}
            aria-label={t('Next month')}
            className={cn(
              s.pill,
              'flex h-9 w-9 items-center justify-center text-fg focus-visible:outline-none focus-visible:shadow-focusRing disabled:opacity-50',
            )}
          >
            <Chevron dir="right" />
          </button>
        </div>
      </div>

      <div
        aria-label={t('Calendar')}
        className={cn(
          'grid grid-cols-7 gap-1 sm:gap-1.5',
          pending && 'opacity-60',
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
                count={counts[key] ?? 0}
                onPick={() => onPick(key)}
              />
            ),
          )}
      </div>
    </GlassPanel>
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
          className="absolute bottom-1 flex gap-0.5 sm:bottom-1.5"
        >
          {Array.from({ length: Math.min(count, 3) }).map((_, i) => (
            <span key={i} className="h-1 w-1 rounded-full bg-brand" />
          ))}
        </span>
      ) : null}
    </button>
  );
}

/**
 * A panel of month numbers, two by two. Beside the calendar it is stretched
 * to the calendar's height; the tiles share that height rather than leaving
 * empty glass under them.
 */
export function StatsPanel({
  title,
  stats,
  className,
}: {
  title: string;
  stats: { label: string; value: number }[];
  className?: string;
}) {
  return (
    <GlassPanel className={cn('p-5 sm:p-6', className)}>
      <h2 className="mb-4 text-heading text-fg">{title}</h2>
      <dl className="grid flex-1 auto-rows-fr grid-cols-2 gap-2 sm:gap-3">
        {stats.map((x) => (
          <div
            key={x.label}
            className={cn(
              s.inset,
              'flex min-w-0 flex-col justify-between px-4 py-3',
            )}
          >
            <dt className="truncate text-micro uppercase tracking-[0.1em] text-fg-subtle">
              {x.label}
            </dt>
            <dd className="mt-1 text-metric tnum text-fg">{x.value}</dd>
          </div>
        ))}
      </dl>
    </GlassPanel>
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
