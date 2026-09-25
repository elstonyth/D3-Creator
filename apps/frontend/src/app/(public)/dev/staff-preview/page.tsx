import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { addDays, monthRange, todayKey } from '@gitroom/frontend/lib/tracker';
import { weekStart, type Shoot } from '@gitroom/frontend/lib/team/shoots';
import { finishedBy, type Video } from '@gitroom/frontend/lib/team/videos';
import { Container, Section } from '@gitroom/frontend/components/ui/section';
import { WeekSchedule } from '@gitroom/frontend/components/team/week-schedule';
import { VideoBoard } from '@gitroom/frontend/components/team/video-board';
import { HistoryView } from '@gitroom/frontend/components/team/history-view';
import { PersonVideos } from '@gitroom/frontend/components/team/person-videos';
import { TeamManager } from '@gitroom/frontend/app/(admin)/admin/team/team-manager';

export const metadata: Metadata = {
  title: 'Staff portal preview — D3 Creator',
  robots: { index: false, follow: false },
};

export const dynamic = 'force-dynamic';

const VIEWS = [
  'work',
  'schedule',
  'admin-videos',
  'admin-schedule',
  'team',
  'person',
] as const;
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
 * Scratch preview of the staff portal and the admin's team pages on sample
 * data, so the screens can be looked at without a session. The staff views
 * are signed in as HOWEN, who both shoots and edits, so every list has
 * something in it. Saves go to the real server actions and are refused (no
 * staff session), which also shows the refusal state. Dev only: 404 in
 * production.
 */
export default async function StaffPreviewPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string }>;
}) {
  if (process.env.NODE_ENV === 'production') notFound();
  const { view: asked } = await searchParams;
  const view: View = (VIEWS as readonly string[]).includes(asked ?? '')
    ? (asked as View)
    : 'work';

  const today = todayKey();
  const start = weekStart(today);
  const month = today.slice(0, 7);
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
    date: addDays(start, offset),
    time,
    title,
    creatorId: null,
    videosShot: null,
    status: 'planned',
    note: null,
    ...extra,
  });
  const shoots: Shoot[] = [
    shoot(1, KEE, 1, '19:30', '火锅店'),
    shoot(2, KEE, 1, '21:00', '甜品店', { creatorId: acct(2) }),
    shoot(3, KEE, 2, '11:30', 'Café visit', {
      status: 'done',
      videosShot: 3,
    }),
    shoot(4, ZUWEI, 3, null, '家具店'),
    shoot(5, ZUWEI, 3, null, '下午 工厂参观', { status: 'cancelled' }),
    shoot(6, HOWEN, 0, '10:00', '卖海鲜的Gary', {
      creatorId: acct(1),
      status: 'done',
      videosShot: 4,
    }),
    shoot(7, HOWEN, 2, '14:00', '工厂参观', {
      creatorId: acct(3),
      note: 'Bring the gimbal',
    }),
    shoot(8, HOWEN, 4, '19:30', '海边', { status: 'cancelled' }),
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

  const views: Record<View, { title: string; body: React.ReactNode }> = {
    work: {
      title: 'Staff · My work (signed in as HOWEN)',
      body: (
        <VideoBoard
          videos={mine}
          people={people}
          accounts={accounts}
          meId={HOWEN}
          month={month}
        />
      ),
    },
    schedule: {
      title: 'Staff · Schedule (signed in as HOWEN)',
      body: (
        <WeekSchedule
          start={start}
          today={today}
          shoots={shoots}
          people={people}
          accounts={accounts}
          meId={HOWEN}
          basePath="/dev/staff-preview"
        />
      ),
    },
    'admin-videos': {
      title: 'Admin · Videos',
      body: (
        <VideoBoard
          videos={videos}
          people={people}
          accounts={accounts}
          meId={null}
          month={month}
          readOnly
        />
      ),
    },
    'admin-schedule': {
      title: 'Admin · Schedule',
      body: (
        <WeekSchedule
          start={start}
          today={today}
          shoots={shoots}
          people={people}
          accounts={accounts}
          meId={null}
          readOnly
          basePath="/dev/staff-preview"
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

  return (
    <Container>
      <Section space="sm" className="space-y-6">
        <p className="rounded-2xl border border-brand/40 bg-brand/10 px-5 py-3 text-body-sm text-fg">
          Sample data — nothing here saves.{' '}
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
        <h1 className="text-section text-fg">{views[view].title}</h1>
        {views[view].body}
      </Section>
    </Container>
  );
}
