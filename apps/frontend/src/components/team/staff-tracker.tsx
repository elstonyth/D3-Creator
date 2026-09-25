'use client';

/**
 * The staff portal's home: one person's own Work Tracker. Their shoots on
 * the spotlight and the calendar, the picked day's shoots to add, change and
 * pass on, their month in four numbers, and the videos in their hands — to
 * edit, to verify, passed on and still with the editor, done this month —
 * each naming who edits it and who verifies it.
 *
 * Everything here is the signed-in person's already (the page reads it
 * scoped, lib/team/tracker-data.ts); nothing is filtered to them here.
 */

import { useState } from 'react';
import { useI18n } from '@gitroom/frontend/components/i18n/locale-provider';
import { localeTag } from '@gitroom/frontend/lib/i18n';
import { addDays } from '@gitroom/frontend/lib/tracker';
import type { Shoot } from '@gitroom/frontend/lib/team/shoots';
import { mySection } from '@gitroom/frontend/lib/team/videos';
import type { StaffTrackerData } from '@gitroom/frontend/lib/team/tracker-data';
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

export interface StaffTrackerProps extends StaffTrackerData {
  /** `YYYY-MM` on the calendar. */
  month: string;
  today: string;
  /** `?day=`, already checked to be inside `month`. */
  initialDay: string | null;
  /** The signed-in staff member's person. */
  meId: string;
}

export function StaffTracker({
  month,
  today,
  initialDay,
  shoots: initialShoots,
  videos,
  edited,
  verified,
  people,
  accounts,
  meId,
}: StaffTrackerProps) {
  const { t, locale } = useI18n();
  const [shoots, setShoots] = useState<Shoot[]>(initialShoots);
  // A refresh brings the server's list again (a video taken back on the
  // board below can turn its shoot back to planned): it replaces this copy.
  // The page hands the same array through until then (see VideoBoard).
  const [fromServer, setFromServer] = useState(initialShoots);
  if (fromServer !== initialShoots) {
    setFromServer(initialShoots);
    setShoots(initialShoots);
  }
  const nav = useTrackerNav(month, today, initialDay);
  const thisMonth = today.slice(0, 7);

  const accountOf = new Map(accounts.map((a) => [a.id, a.name]));
  // The month on the calendar; the list also carries today's and
  // tomorrow's for the spotlight, which may be in another month.
  const inMonth = shoots.filter((x) => x.date.startsWith(month));
  const done = inMonth.filter((x) => x.status === 'done');
  const counts: Record<string, number> = {};
  for (const x of inMonth)
    if (x.status !== 'cancelled') counts[x.date] = (counts[x.date] ?? 0) + 1;

  // Today's queue: the videos waiting on this person now.
  let toEdit = 0;
  let toVerify = 0;
  for (const v of videos) {
    const at = mySection(v, meId, thisMonth);
    if (at === 'toEdit') toEdit++;
    else if (at === 'toVerify') toVerify++;
  }

  const spot = (key: string) => ({
    key,
    items: shoots
      .filter((x) => x.date === key && x.status !== 'cancelled')
      .map((x) => ({
        id: x.id,
        label: [
          x.time,
          x.title,
          x.creatorId ? accountOf.get(x.creatorId) : null,
        ]
          .filter(Boolean)
          .join(' · '),
      })),
  });

  return (
    <TrackerScene
      eyebrow={t('Staff')}
      subline={t(
        'Your shoots, the videos you passed on, and what is waiting for you.',
      )}
      today={today}
    >
      <Spotlight
        today={today}
        onPick={nav.pick}
        days={[
          {
            ...spot(today),
            note:
              toEdit + toVerify > 0
                ? t('{edit} to edit · {verify} to verify', {
                    edit: toEdit,
                    verify: toVerify,
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
              ? t('This month')
              : fmtDate(`${month}-01`, localeTag(locale), {
                  month: 'long',
                  year: 'numeric',
                })
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
        {/* The picked day on its own row under the calendar, as the old
            board's events: its forms get the width, and the calendar never
            stretches to its height. */}
        <DayShoots
          // A new day is a fresh panel: no form left open from another.
          key={nav.selected}
          day={nav.selected}
          today={today}
          shoots={shoots.filter((x) => x.date === nav.selected)}
          people={people}
          accounts={accounts}
          meId={meId}
          setShoots={setShoots}
          className="lg:col-span-12"
        />
      </section>

      <GlassPanel className="mt-4 p-4 sm:p-6 md:mt-6">
        <div className="mb-5">
          <h2 className="text-heading text-fg">{t('My videos')}</h2>
          <p className="mt-1 text-body-sm text-fg-muted">
            {t(
              'Edit a video, then click Done. Videos you passed on come back here to verify once their editor is done.',
            )}
          </p>
        </div>
        <VideoBoard
          // The page's own array, untouched: a new one means the server
          // re-read the list (see VideoBoard).
          videos={videos}
          people={people}
          accounts={accounts}
          meId={meId}
          month={thisMonth}
        />
      </GlassPanel>
    </TrackerScene>
  );
}
