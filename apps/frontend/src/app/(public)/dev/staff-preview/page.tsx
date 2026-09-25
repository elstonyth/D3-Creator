import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import {
  addDays,
  isDateKey,
  isMonthKey,
  monthRange,
  todayKey,
} from '@gitroom/frontend/lib/tracker';
import type { Shoot } from '@gitroom/frontend/lib/team/shoots';
import {
  doneCounts,
  finishedBy,
  type Video,
} from '@gitroom/frontend/lib/team/videos';
import { Container, Section } from '@gitroom/frontend/components/ui/section';
import { StaffTracker } from '@gitroom/frontend/components/team/staff-tracker';
import { AdminTracker } from '@gitroom/frontend/components/team/admin-tracker';
import { HistoryView } from '@gitroom/frontend/components/team/history-view';
import { PersonVideos } from '@gitroom/frontend/components/team/person-videos';
import { TeamManager } from '@gitroom/frontend/app/(admin)/admin/team/team-manager';

export const metadata: Metadata = {
  title: 'Staff portal preview — D3 Creator',
  robots: { index: false, follow: false },
};

export const dynamic = 'force-dynamic';

const VIEWS = ['tracker', 'admin-tracker', 'team', 'person'] as const;
type View = (typeof VIEWS)[number];

const KEE = 'aaaaaaaa-0000-4000-8000-000000000001';
const ZUWEI = 'aaaaaaaa-0000-4000-8000-000000000002';
const HOWEN = 'aaaaaaaa-0000-4000-8000-000000000003';
const MEI = 'aaaaaaaa-0000-4000-8000-000000000004';
const acct = (n: number) => `bbbbbbbb-0000-4000-8000-00000000000${n}`;

const people = [
  { id: KEE, name: 'KEE', kind: 'handler' as const, archived: false },
  { id: ZUWEI, name: 'ZUWEI', kind: 'handler' as const, archived: false },
  { id: HOWEN, name: 'HOWEN', kind: 'both' as const, archived: false },
  { id: MEI, name: 'MEI', kind: 'editor' as const, archived: false },
];
const accounts = [
  { id: acct(1), name: 'Zero的阿Phang' },
  { id: acct(2), name: '做火锅的老黄' },
  { id: acct(3), name: '老头子阿玮' },
  { id: acct(4), name: 'Provisa小老板' },
];

/**
 * Scratch preview of the two Work Trackers and the admin's team pages on
 * sample data, so the screens can be looked at without a session. The staff
 * tracker is signed in as HOWEN, who both shoots and edits, so every list
 * has something in it. Saves go to the real server actions and are refused
 * (no staff session), which also shows the refusal state. Dev only: 404 in
 * production.
 */
export default async function StaffPreviewPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string; month?: string; day?: string }>;
}) {
  if (process.env.NODE_ENV === 'production') notFound();
  const { view: asked, month: askedMonth, day: askedDay } = await searchParams;
  const view: View = (VIEWS as readonly string[]).includes(asked ?? '')
    ? (asked as View)
    : 'tracker';

  const today = todayKey();
  const month = today.slice(0, 7);
  // The trackers' calendar month; the sample data stays around today.
  const shown = isMonthKey(askedMonth) ? askedMonth : month;
  const day =
    isDateKey(askedDay) && askedDay.startsWith(shown) ? askedDay : null;
  // Sample instants from today's date key (a lib call), not the clock:
  // render bodies stay pure.
  const ago = (days: number) => `${addDays(today, -days)}T04:00:00.000Z`;

  const shoot = (
    n: number,
    memberId: string,
    offset: number,
    time: string | null,
    title: string,
    extra: Partial<Shoot> = {},
  ): Shoot => ({
    id: `cccccccc-0000-4000-8000-00000000000${n}`,
    memberId,
    // Days from today, so the spotlight cards have something on them.
    date: addDays(today, offset),
    time,
    title,
    creatorId: null,
    videosShot: null,
    status: 'planned',
    note: null,
    ...extra,
  });
  const shoots: Shoot[] = [
    shoot(1, KEE, 0, '19:30', '火锅店'),
    shoot(2, KEE, 1, '21:00', '甜品店', { creatorId: acct(2) }),
    shoot(3, KEE, -2, '11:30', 'Café visit', {
      status: 'done',
      videosShot: 3,
    }),
    shoot(4, ZUWEI, 1, null, '家具店'),
    shoot(5, ZUWEI, 3, null, '下午 工厂参观', { status: 'cancelled' }),
    shoot(6, HOWEN, -1, '10:00', '卖海鲜的Gary', {
      creatorId: acct(1),
      status: 'done',
      videosShot: 4,
    }),
    shoot(7, HOWEN, 0, '14:00', '工厂参观', {
      creatorId: acct(3),
      note: 'Bring the gimbal',
    }),
    shoot(8, HOWEN, 1, '11:30', 'Café visit', { creatorId: acct(4) }),
    shoot(9, HOWEN, 4, '19:30', '海边', { status: 'cancelled' }),
  ];

  const video = (n: number, patch: Partial<Video>): Video => ({
    id: `dddddddd-0000-4000-8000-00000000000${n}`,
    creatorId: acct(1),
    shootId: null,
    title: `Reel ${n}`,
    editorId: MEI,
    handlerId: HOWEN,
    editedAt: null,
    editedBy: null,
    editLink: null,
    verifiedAt: null,
    verifiedBy: null,
    createdAt: ago(3),
    ...patch,
  });
  const cut = 'https://drive.google.com/file/d/sample/view';
  const videos: Video[] = [
    // HOWEN edits these: one from KEE's shoot, one from their own.
    video(1, { title: 'CNY promo — reel 2', editorId: HOWEN, handlerId: KEE }),
    video(2, { title: 'Gary — fish market', editorId: HOWEN }),
    // MEI is done; HOWEN passed them on, so verifies them.
    video(3, {
      title: 'Gary — late-night stall',
      editedAt: ago(1),
      editedBy: MEI,
      editLink: cut,
    }),
    video(4, {
      title: 'Gary — the price board',
      editedAt: ago(1),
      editedBy: MEI,
    }),
    // Still with MEI.
    video(5, { title: 'Factory tour cut', creatorId: acct(3) }),
    // Finished this month by HOWEN: an edit (KEE verifies it) and a check.
    video(6, {
      title: 'Hotpot opening night',
      creatorId: acct(2),
      editorId: HOWEN,
      handlerId: KEE,
      editedAt: ago(2),
      editedBy: HOWEN,
      editLink: cut,
    }),
    video(7, {
      title: 'Provisa weekend deal',
      creatorId: acct(4),
      editedAt: ago(3),
      editedBy: MEI,
      editLink: cut,
      verifiedAt: ago(1),
      verifiedBy: HOWEN,
    }),
    // Nothing to do with HOWEN: the admin's board only.
    video(8, { title: 'Furniture shop', handlerId: ZUWEI, creatorId: null }),
    video(9, {
      title: 'Café visit — latte art',
      handlerId: KEE,
      editedAt: ago(4),
      editedBy: MEI,
      editLink: cut,
      verifiedAt: ago(2),
      verifiedBy: KEE,
    }),
  ];
  const mine = videos.filter(
    (v) => v.editorId === HOWEN || v.handlerId === HOWEN,
  );
  const { from, to } = monthRange(month);
  const howenDone = finishedBy(
    videos,
    HOWEN,
    new Date(from).toISOString(),
    new Date(to).toISOString(),
  );
  const accountName = new Map(accounts.map((a) => [a.id, a.name]));
  const iso = (instant: string) => new Date(instant).toISOString();

  const views: Record<View, { title: string; body: React.ReactNode }> = {
    tracker: {
      title: 'Staff · Work Tracker (signed in as HOWEN)',
      body: (
        <StaffTracker
          key={shown}
          month={shown}
          today={today}
          initialDay={day}
          shoots={shoots.filter((s) => s.memberId === HOWEN)}
          videos={mine}
          edited={howenDone.edited.length}
          verified={howenDone.verified.length}
          people={people}
          accounts={accounts}
          meId={HOWEN}
        />
      ),
    },
    'admin-tracker': {
      title: 'Admin · Work Tracker',
      body: (
        <AdminTracker
          key={shown}
          month={shown}
          today={today}
          initialDay={day}
          shoots={shoots}
          videos={videos}
          done={Object.fromEntries(
            people.map((p) => [
              p.id,
              doneCounts(videos, p.id, iso(from), iso(to)),
            ]),
          )}
          edited={videos.filter((v) => v.editedAt).length}
          verified={videos.filter((v) => v.verifiedAt).length}
          people={people}
          accounts={accounts}
          // The preview has one sample profile; the id rides along unused.
          profileBase="/dev/staff-preview?view=person&of="
        />
      ),
    },
    team: {
      title: 'Admin · Team',
      body: (
        <TeamManager
          pending={[
            {
              userId: 'ffffffff-0000-4000-8000-000000000001',
              email: 'sk.d3@example.com',
              name: 'SK',
              kind: 'handler',
              signedUpAt: ago(0),
              confirmed: true,
              approved: false,
            },
            {
              userId: 'ffffffff-0000-4000-8000-000000000002',
              email: 'ali.cuts@example.com',
              name: 'ALI',
              kind: 'editor',
              signedUpAt: ago(1),
              confirmed: false,
              approved: false,
            },
          ]}
          team={[
            {
              id: KEE,
              name: 'KEE',
              kind: 'handler',
              email: 'kee@example.com',
              shootsDone: 9,
              edited: 0,
              verified: 7,
              profileHref: '/dev/staff-preview?view=person',
            },
            {
              id: ZUWEI,
              name: 'ZUWEI',
              kind: 'handler',
              email: null,
              shootsDone: 5,
              edited: 0,
              verified: 4,
              profileHref: '/dev/staff-preview?view=person',
            },
            {
              id: HOWEN,
              name: 'HOWEN',
              kind: 'both',
              email: 'howen@example.com',
              shootsDone: 2,
              edited: 5,
              verified: 3,
              profileHref: '/dev/staff-preview?view=person',
            },
            {
              id: MEI,
              name: 'MEI',
              kind: 'editor',
              email: 'mei@example.com',
              shootsDone: 0,
              edited: 14,
              verified: 0,
              profileHref: '/dev/staff-preview?view=person',
            },
          ]}
          unlinked={[{ id: ZUWEI, name: 'ZUWEI' }]}
        />
      ),
    },
    person: {
      title: 'Admin · Team · HOWEN',
      body: (
        <HistoryView
          month={month}
          thisMonth={month}
          monthHref={() => '/dev/staff-preview?view=person'}
          shoots={shoots.filter((s) => s.memberId === HOWEN)}
          accountName={accountName}
          edited={howenDone.edited.length}
          verified={howenDone.verified.length}
        >
          <PersonVideos
            edited={howenDone.edited}
            verified={howenDone.verified}
            accountName={accountName}
          />
        </HistoryView>
      ),
    },
  };

  const banner = (
    <p className="rounded-2xl border border-brand/40 bg-brand/10 px-5 py-3 text-body-sm text-fg">
      Sample data — nothing here saves. {views[view].title}.{' '}
      {VIEWS.map((v) => (
        <Link
          key={v}
          href={`/dev/staff-preview?view=${v}`}
          className={
            v === view
              ? 'mr-3 font-medium underline underline-offset-4'
              : 'mr-3 text-fg-muted underline underline-offset-4'
          }
        >
          {v}
        </Link>
      ))}
    </p>
  );

  // The trackers bring their own scene, column and heading.
  if (view === 'tracker' || view === 'admin-tracker')
    return (
      <>
        <div className="relative z-20 mx-auto mt-6 w-full max-w-[1320px] px-4 sm:px-6 md:px-8">
          {banner}
        </div>
        {views[view].body}
      </>
    );

  return (
    <Container>
      <Section space="sm" className="space-y-6">
        {banner}
        <h1 className="text-section text-fg">{views[view].title}</h1>
        {views[view].body}
      </Section>
    </Container>
  );
}
