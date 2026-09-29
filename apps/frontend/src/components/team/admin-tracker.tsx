'use client';

/**
 * The admin console's Work Tracker: everyone's shoots and videos, as staff
 * update them in their own trackers. The same board as the staff one —
 * spotlight, calendar, the picked day — plus the team, one column a person
 * (what they are editing now and what waits on their check), who handles
 * and edits each account, and every video in hand.
 *
 * The admin sets who handles each account by dragging cards (placeAccount)
 * and the order of the people by dragging columns (orderPeople), can remove
 * a video still being edited (removeVideo), and does a handler's steps for
 * anyone, as that person (lib/team/actor.ts): adds, changes, cancels and
 * deletes shoots, passes their videos on, and changes and verifies videos.
 * An editor's Done stays the editor's. When the admin is on the board too
 * (their login linked to a person on the Team page), what waits on them
 * pops up as it does for staff.
 */

import { useState } from 'react';
import Link from 'next/link';
import { useI18n } from '@gitroom/frontend/components/i18n/locale-provider';
import { localeTag } from '@gitroom/frontend/lib/i18n';
import { addDays } from '@gitroom/frontend/lib/tracker';
import {
  isDue,
  sortShoots,
  type Shoot,
} from '@gitroom/frontend/lib/team/shoots';
import {
  isEditorKind,
  videoStage,
  type Video,
} from '@gitroom/frontend/lib/team/videos';
import type { AdminTrackerData } from '@gitroom/frontend/lib/team/tracker-data';
import type { VideoResult } from '@gitroom/frontend/lib/team/video-actions';
import { cn } from '@gitroom/frontend/lib/utils';
// clsx where a custom font-size token sits next to a text colour:
// tailwind-merge would drop the size (see tracker-shell.tsx).
import clsx from 'clsx';
import { AccountBoard } from './account-board';
import { DayShoots } from './day-shoots';
import { GlassPanel } from './glass-panel';
import {
  fmtDate,
  Spotlight,
  StatsPanel,
  TrackerCalendar,
  TrackerScene,
  useNow,
  useRereadEveryMinute,
  useTrackerNav,
} from './tracker-shell';
import { VideoBoard } from './video-board';
import { WorkAlerts } from './work-alerts';
import s from './tracker.module.scss';

export interface AdminTrackerProps extends AdminTrackerData {
  /** `YYYY-MM` on the calendar. */
  month: string;
  today: string;
  /** `?day=`, already checked to be inside `month`. */
  initialDay: string | null;
  /** Where a person's profile lives on this host (`/team` or `/admin/team`). */
  profileBase: string;
  /** The admin's Remove, for a video still being edited. */
  removeVideo?: (id: string) => Promise<VideoResult>;
  /** The account board's drop: a column's new order, and a handover. */
  placeAccount?: (
    order: string[],
    move?: { creatorId: string; handlerId: string | null } | null,
  ) => Promise<{ ok: boolean; message?: string }>;
  /** The account board's column drop: everyone, in their new order. */
  orderPeople?: (order: string[]) => Promise<{ ok: boolean; message?: string }>;
  /**
   * The admin's own person on the board (their login linked to one on the
   * Team page): what waits on them pops up, as it does for staff.
   */
  meId?: string | null;
  /** The admin's login: a shoot someone else added for them pops up. */
  loginId?: string | null;
}

export function AdminTracker({
  month,
  today,
  initialDay,
  shoots: initialShoots,
  videos,
  done: doneBy,
  edited,
  verified,
  people,
  accounts,
  board,
  profileBase,
  removeVideo,
  placeAccount,
  orderPeople,
  meId = null,
  loginId = null,
}: AdminTrackerProps) {
  const { t, locale } = useI18n();
  const tag = localeTag(locale);
  const nav = useTrackerNav(month, today, initialDay);
  const thisMonth = today.slice(0, 7);
  const now = useNow();
  // Only while on screen: the admin's page is the heavy one.
  useRereadEveryMinute(false);
  // The admin changes shoots here too: the tracker keeps the list, and a
  // refresh brings the server's again (as on the staff tracker).
  const [shoots, setShoots] = useState<Shoot[]>(initialShoots);
  const [fromServer, setFromServer] = useState(initialShoots);
  if (fromServer !== initialShoots) {
    setFromServer(initialShoots);
    setShoots(initialShoots);
  }

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
        // The admin's own shoot whose videos are due.
        due: meId !== null && now !== null && isDue(x, meId, now),
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
          className="lg:col-span-5"
        />
        {/* The picked day on its own row, as on the staff tracker. */}
        <DayShoots
          key={nav.selected}
          day={nav.selected}
          today={today}
          shoots={shoots.filter((x) => x.date === nav.selected)}
          people={people}
          accounts={accounts}
          meId={meId}
          setShoots={setShoots}
          forAnyone
          now={now}
          onPick={nav.pick}
          className="lg:col-span-12"
        />
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
                    otherLabel={t('From')}
                    other={(v) => nameOf.get(v.handlerId) ?? '—'}
                  />
                  <VideoList
                    title={t('To verify')}
                    empty={t('Nothing waiting on them.')}
                    videos={toVerify}
                    // Whose cut it is.
                    otherLabel={t('Cut by')}
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

      <AccountBoard
        monthLabel={monthLabel}
        people={people}
        accounts={board}
        onPlace={placeAccount}
        onOrder={orderPeople}
      />

      <GlassPanel className="mt-4 p-4 sm:p-6 md:mt-6">
        <div className="mb-5">
          {/* The pop-up's "Go to my videos" lands here. */}
          <h2 id="my-videos" className="scroll-mt-6 text-heading text-fg">
            {t('Videos')}
          </h2>
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
          everyone
          forAnyone
          adminRemove={removeVideo}
        />
      </GlassPanel>

      {meId && loginId ? (
        <WorkAlerts
          meId={meId}
          loginId={loginId}
          month={thisMonth}
          today={today}
          now={now}
          shoots={shoots}
          videos={videos}
          people={people}
          accounts={accounts}
          editors={people.filter((p) => !p.archived && isEditorKind(p.kind))}
          onPassed={(next) =>
            setShoots((p) =>
              sortShoots(p.map((x) => (x.id === next.id ? next : x))),
            )
          }
        />
      ) : null}
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
  otherLabel,
  other,
}: {
  title: string;
  empty: string;
  videos: Video[];
  /** What the name at each row's right is: heads that column. */
  otherLabel: string;
  /** The other hand on each video, at the far right of its row. */
  other: (v: Video) => string;
}) {
  return (
    <div className="mt-2">
      <p className="mb-1.5 flex items-baseline justify-between gap-3 px-1 text-micro uppercase tracking-[0.14em] text-fg-subtle">
        <span>
          {title} <span className="tnum">{videos.length}</span>
        </span>
        {/* Each row says it to a screen reader itself. */}
        {videos.length > 0 ? <span aria-hidden>{otherLabel}</span> : null}
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
              className={clsx(
                s.inset,
                'flex items-baseline justify-between gap-3 px-3 py-2 text-body-sm text-fg',
              )}
            >
              <span className="min-w-0 break-words">{v.title}</span>
              <span className="shrink-0 text-right text-fg-muted">
                <span className="sr-only">{otherLabel} </span>
                {other(v)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
