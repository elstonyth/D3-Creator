'use client';

/**
 * The admin console's Work Tracker: everyone's shoots and videos, read-only,
 * as staff update them in their own trackers. The same board as the staff
 * one — spotlight, calendar, the picked day — plus the team, one column a
 * person (what they are editing now and what waits on their check), and
 * every video in hand.
 *
 * Nothing here changes anything: the admin only looks (the server refuses
 * an admin's writes too, lib/team/actor.ts).
 */

import Link from 'next/link';
import { useI18n } from '@gitroom/frontend/components/i18n/locale-provider';
import { localeTag } from '@gitroom/frontend/lib/i18n';
import { addDays } from '@gitroom/frontend/lib/tracker';
import { videoStage, type Video } from '@gitroom/frontend/lib/team/videos';
import type { AdminTrackerData } from '@gitroom/frontend/lib/team/tracker-data';
import { cn } from '@gitroom/frontend/lib/utils';
// clsx where a custom font-size token sits next to a text colour:
// tailwind-merge would drop the size (see tracker-shell.tsx).
import clsx from 'clsx';
import { DayShoots } from './day-shoots';
import { GlassPanel } from './glass-panel';
import {
  fmtDate,
  Spotlight,
  StatsPanel,
  TrackerCalendar,
  TrackerScene,
  useTrackerNav,
} from './tracker-shell';
import { VideoBoard } from './video-board';
import s from './tracker.module.scss';

export interface AdminTrackerProps extends AdminTrackerData {
  /** `YYYY-MM` on the calendar. */
  month: string;
  today: string;
  /** `?day=`, already checked to be inside `month`. */
  initialDay: string | null;
  /** Where a person's profile lives on this host (`/team` or `/admin/team`). */
  profileBase: string;
}

export function AdminTracker({
  month,
  today,
  initialDay,
  shoots,
  videos,
  done: doneBy,
  edited,
  verified,
  people,
  accounts,
  profileBase,
}: AdminTrackerProps) {
  const { t, locale } = useI18n();
  const tag = localeTag(locale);
  const nav = useTrackerNav(month, today, initialDay);
  const thisMonth = today.slice(0, 7);

  const nameOf = new Map(people.map((p) => [p.id, p.name]));
  const accountOf = new Map(accounts.map((a) => [a.id, a.name]));
  const inMonth = shoots.filter((x) => x.date.startsWith(month));
  const done = inMonth.filter((x) => x.status === 'done');
  const counts: Record<string, number> = {};
  for (const x of inMonth)
    if (x.status !== 'cancelled') counts[x.date] = (counts[x.date] ?? 0) + 1;

  let editing = 0;
  let waiting = 0;
  for (const v of videos) {
    const stage = videoStage(v);
    if (stage === 'editing') editing++;
    else if (stage === 'verifying') waiting++;
  }

  const spot = (key: string) => ({
    key,
    items: shoots
      .filter((x) => x.date === key && x.status !== 'cancelled')
      .map((x) => ({
        id: x.id,
        label: [
          x.time,
          nameOf.get(x.memberId),
          x.title,
          x.creatorId ? accountOf.get(x.creatorId) : null,
        ]
          .filter(Boolean)
          .join(' · '),
      })),
  });

  const monthLabel = fmtDate(`${month}-01`, tag, {
    month: 'long',
    year: 'numeric',
  });

  return (
    <TrackerScene
      eyebrow={t('Admin console')}
      subline={t('Everyone’s shoots and videos as staff update them.')}
      today={today}
    >
      <Spotlight
        today={today}
        onPick={nav.pick}
        days={[
          {
            ...spot(today),
            note:
              editing + waiting > 0
                ? t('{editing} being edited · {waiting} waiting to verify', {
                    editing,
                    waiting,
                  })
                : null,
          },
          spot(addDays(today, 1)),
        ]}
      />

      <section className="grid grid-cols-1 gap-4 md:gap-6 lg:grid-cols-12">
        <TrackerCalendar
          month={month}
          today={today}
          selected={nav.selected}
          counts={counts}
          pending={nav.pending}
          onPick={nav.pick}
          onMonth={nav.gotoMonth}
          className="lg:col-span-7"
        />
        <div className="flex flex-col gap-4 md:gap-6 lg:col-span-5">
          <StatsPanel
            title={
              month === thisMonth
                ? t('Team this month')
                : t('Team · {month}', { month: monthLabel })
            }
            stats={[
              { label: t('Shoots done'), value: done.length },
              {
                label: t('Videos passed'),
                value: done.reduce((n, x) => n + (x.videosShot ?? 0), 0),
              },
              { label: t('Edited'), value: edited },
              { label: t('Verified'), value: verified },
            ]}
          />
          <DayShoots
            key={nav.selected}
            day={nav.selected}
            today={today}
            shoots={shoots.filter((x) => x.date === nav.selected)}
            people={people}
            accounts={accounts}
            meId={null}
            className="flex-1"
          />
        </div>
      </section>

      <GlassPanel className="mt-4 p-4 sm:p-6 md:mt-6">
        <div className="mb-5">
          <h2 className="text-heading text-fg">{t('Team')}</h2>
          <p className="mt-1 text-body-sm text-fg-muted">
            {t(
              'What each person is editing now and what waits on their check. Numbers are for {month}.',
              { month: monthLabel },
            )}
          </p>
        </div>
        {/* As many columns as fit, each at least 240px; a narrow screen gets
            one. The board never scrolls sideways. */}
        <div className="grid gap-4 [grid-template-columns:repeat(auto-fit,minmax(240px,1fr))]">
          {people
            .filter((p) => !p.archived)
            .map((p) => {
              const own = inMonth.filter(
                (x) => x.memberId === p.id && x.status === 'done',
              ).length;
              const editingNow = videos.filter(
                (v) => v.editorId === p.id && !v.editedAt,
              );
              const toVerify = videos.filter(
                (v) => v.handlerId === p.id && v.editedAt && !v.verifiedAt,
              );
              return (
                <section
                  key={p.id}
                  aria-label={p.name}
                  className={cn(s.inset, 'flex min-w-0 flex-col p-3')}
                >
                  <header className="mb-3 px-1">
                    {/* Wraps rather than cutting the name when the job
                        pill is long ("Handler & editor"). */}
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <h3 className="min-w-0 break-words text-subsection text-fg">
                        {p.name}
                      </h3>
                      <span
                        className={clsx(
                          s.pill,
                          'shrink-0 px-2.5 py-1 text-micro uppercase tracking-[0.1em] text-fg-muted',
                        )}
                      >
                        {p.kind === 'both'
                          ? t('Handler & editor')
                          : p.kind === 'editor'
                            ? t('Editor')
                            : t('Handler')}
                      </span>
                    </div>
                    <dl className="mt-2 grid grid-cols-3 gap-2">
                      <Stat label={t('Shoots')} value={own} />
                      <Stat
                        label={t('Edited')}
                        value={doneBy[p.id]?.edited ?? 0}
                      />
                      <Stat
                        label={t('Verified')}
                        value={doneBy[p.id]?.verified ?? 0}
                      />
                    </dl>
                  </header>

                  <VideoList
                    title={t('Editing now')}
                    empty={t('Nothing in their hands.')}
                    videos={editingNow}
                    // Who passed it on, and checks it next.
                    other={(v) => nameOf.get(v.handlerId) ?? '—'}
                  />
                  <VideoList
                    title={t('To verify')}
                    empty={t('Nothing waiting on them.')}
                    videos={toVerify}
                    // Whose cut it is.
                    other={(v) => nameOf.get(v.editorId) ?? '—'}
                  />

                  <Link
                    href={`${profileBase}/${p.id}`}
                    className="mt-3 self-start rounded px-1 text-label text-fg-muted underline-offset-4 hover:text-fg hover:underline focus-visible:outline-none focus-visible:shadow-focusRing"
                  >
                    {t('Open profile')} →
                  </Link>
                </section>
              );
            })}
        </div>
      </GlassPanel>

      <GlassPanel className="mt-4 p-4 sm:p-6 md:mt-6">
        <div className="mb-5">
          <h2 className="text-heading text-fg">{t('Videos')}</h2>
          <p className="mt-1 text-body-sm text-fg-muted">
            {t(
              'Who is editing each video now, and who verifies it next. Staff pass videos on from their shoots; each Done and Verify counts toward their month.',
            )}
          </p>
        </div>
        <VideoBoard
          videos={videos}
          people={people}
          accounts={accounts}
          meId={null}
          month={thisMonth}
          readOnly
        />
      </GlassPanel>
    </TrackerScene>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="min-w-0">
      <dt className="truncate text-micro uppercase tracking-[0.1em] text-fg-subtle">
        {label}
      </dt>
      <dd className="text-heading tnum text-fg">{value}</dd>
    </div>
  );
}

function VideoList({
  title,
  empty,
  videos,
  other,
}: {
  title: string;
  empty: string;
  videos: Video[];
  /** The other hand on each video, named beside its title. */
  other: (v: Video) => string;
}) {
  return (
    <div className="mt-2">
      <p className="mb-1.5 px-1 text-micro uppercase tracking-[0.14em] text-fg-subtle">
        {title} <span className="tnum">{videos.length}</span>
      </p>
      {videos.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-white/10 px-3 py-3 text-center text-caption text-fg-subtle">
          {empty}
        </p>
      ) : (
        <ul className="space-y-1.5">
          {videos.map((v) => (
            <li
              key={v.id}
              className={clsx(s.inset, 'px-3 py-2 text-body-sm text-fg')}
            >
              <span className="break-words">{v.title}</span>
              <span className="text-fg-muted"> · {other(v)}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
