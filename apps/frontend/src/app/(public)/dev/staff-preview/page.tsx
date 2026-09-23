import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { addDays, todayKey } from '@gitroom/frontend/lib/tracker';
import { weekStart, type Shoot } from '@gitroom/frontend/lib/team/shoots';
import type { Video } from '@gitroom/frontend/lib/team/videos';
import type { AccountMonth } from '@gitroom/frontend/lib/team/load';
import { Container, Section } from '@gitroom/frontend/components/ui/section';
import { WeekSchedule } from '@gitroom/frontend/components/team/week-schedule';
import { VideoBoard } from '@gitroom/frontend/components/team/video-board';
import { MyTasks } from '@gitroom/frontend/components/team/my-tasks';
import { HistoryView } from '@gitroom/frontend/components/team/history-view';
import { PersonVideos } from '@gitroom/frontend/components/team/person-videos';
import { TeamManager } from '@gitroom/frontend/app/(admin)/admin/team/team-manager';

export const metadata: Metadata = {
  title: 'Staff portal preview — D3 Creator',
  robots: { index: false, follow: false },
};

export const dynamic = 'force-dynamic';

const VIEWS = ['work', 'schedule', 'history', 'admin-videos', 'team'] as const;
type View = (typeof VIEWS)[number];

const KEE = 'aaaaaaaa-0000-4000-8000-000000000001';
const ZUWEI = 'aaaaaaaa-0000-4000-8000-000000000002';
const HOWEN = 'aaaaaaaa-0000-4000-8000-000000000003';
const MEI = 'aaaaaaaa-0000-4000-8000-000000000004';
const acct = (n: number) => `bbbbbbbb-0000-4000-8000-00000000000${n}`;

const people = [
  { id: KEE, name: 'KEE', kind: 'handler' as const, archived: false },
  { id: ZUWEI, name: 'ZUWEI', kind: 'handler' as const, archived: false },
  { id: HOWEN, name: 'HOWEN', kind: 'handler' as const, archived: false },
  { id: MEI, name: 'MEI', kind: 'editor' as const, archived: false },
];
const accounts = [
  { id: acct(1), name: 'Zero的阿Phang' },
  { id: acct(2), name: '做火锅的老黄' },
  { id: acct(3), name: '老头子阿玮' },
  { id: acct(4), name: 'Provisa小老板' },
];

/**
 * Scratch preview of the staff portal and the admin's new pages on sample
 * data, so the screens can be looked at before the migration exists
 * anywhere. Saves go to the real server actions and are refused (no staff
 * session), which also shows the refusal state. Dev only: 404 in production.
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
    videosPlanned: null,
    videosShot: null,
    status: 'planned',
    note: null,
    ...extra,
  });
  const shoots: Shoot[] = [
    shoot(1, KEE, 1, '19:30', '火锅店', { videosPlanned: 3 }),
    shoot(2, KEE, 1, '21:00', '甜品店'),
    shoot(3, KEE, 1, '22:00', 'Zero Phang', { creatorId: acct(1) }),
    shoot(4, KEE, 2, '11:30', 'Café visit'),
    shoot(5, KEE, 2, '14:00', '工厂参观', { creatorId: acct(3) }),
    shoot(6, KEE, 2, null, '客户 A 拍4支', { videosPlanned: 4 }),
    shoot(7, ZUWEI, 3, null, '家具店'),
    shoot(8, ZUWEI, 3, null, '下午 工厂参观'),
    shoot(9, ZUWEI, 3, null, '晚上 烧烤店 补5支', { videosPlanned: 5 }),
    shoot(10, HOWEN, 4, '19:30', '海边'),
    shoot(11, KEE, 0, '10:00', '卖海鲜的Gary', {
      status: 'done',
      videosShot: 4,
      videosPlanned: 4,
    }),
  ];

  const video = (n: number, patch: Partial<Video>): Video => ({
    id: `dddddddd-0000-4000-8000-00000000000${n}`,
    creatorId: acct(1),
    title: `Reel ${n}`,
    note: null,
    editorId: MEI,
    handlerId: KEE,
    editedAt: null,
    editedBy: null,
    editLink: null,
    postDate: null,
    postTime: null,
    postedAt: null,
    postedBy: null,
    postLink: null,
    createdAt: ago(3),
    ...patch,
  });
  const videos: Video[] = [
    video(1, { title: 'CNY promo — reel 2', creatorId: acct(2) }),
    video(2, {
      title: 'Factory tour cut',
      creatorId: acct(3),
      handlerId: ZUWEI,
      note: 'Keep it under 45 seconds',
    }),
    video(3, {
      title: 'Zero Phang late-night stall',
      editedAt: ago(1),
      editedBy: MEI,
      editLink: 'https://drive.google.com/file/d/sample/view',
      postDate: addDays(today, 1),
      postTime: '20:00',
    }),
    video(4, {
      title: 'Provisa weekend deal',
      creatorId: acct(4),
      editedAt: ago(2),
      editedBy: MEI,
      editLink: 'https://drive.google.com/file/d/sample2/view',
    }),
    video(5, {
      title: 'Hotpot opening night',
      creatorId: acct(2),
      editedAt: ago(4),
      editedBy: MEI,
      editLink: 'https://drive.google.com/file/d/sample3/view',
      postedAt: ago(3),
      postedBy: KEE,
      postLink: 'https://www.instagram.com/p/sample/',
    }),
  ];

  const accountMonth = (
    n: number,
    videosN: number,
    views: number,
  ): AccountMonth => ({
    id: acct(n),
    name: accounts[n - 1].name,
    avatarUrl: null,
    platforms: ['douyin', 'facebook', 'instagram', 'tiktok'],
    videos: videosN,
    posts: videosN * 3,
    views,
  });

  const views: Record<View, { title: string; body: React.ReactNode }> = {
    work: {
      title: 'Staff · My work (signed in as KEE)',
      body: (
        <div className="space-y-10">
          <MyTasks
            tasks={[
              {
                id: 'eeeeeeee-0000-4000-8000-000000000001',
                title: 'Confirm Thursday shoot with 老头子',
                done: false,
              },
              {
                id: 'eeeeeeee-0000-4000-8000-000000000002',
                title: 'Send Gary the September report',
                done: false,
              },
              {
                id: 'eeeeeeee-0000-4000-8000-000000000003',
                title: 'Collect props for the hotpot shoot',
                done: true,
              },
            ]}
          />
          <VideoBoard
            videos={videos.filter(
              (v) => v.editorId === KEE || v.handlerId === KEE,
            )}
            people={people}
            accounts={accounts}
            meId={KEE}
          />
        </div>
      ),
    },
    schedule: {
      title: 'Staff · Schedule (signed in as KEE)',
      body: (
        <WeekSchedule
          start={start}
          today={today}
          shoots={shoots}
          people={people}
          accounts={accounts}
          meId={KEE}
          basePath="/dev/staff-preview"
        />
      ),
    },
    history: {
      title: 'Staff · History (KEE)',
      body: (
        <HistoryView
          month={month}
          thisMonth={month}
          monthHref={(m) => `/dev/staff-preview?view=history&month=${m}`}
          shoots={shoots.filter((s) => s.memberId === KEE)}
          accountName={new Map(accounts.map((a) => [a.id, a.name]))}
          handled={[accountMonth(1, 31, 891000), accountMonth(2, 12, 1009974)]}
          edited={[]}
          handovers={[
            {
              creatorId: acct(4),
              creatorName: 'Provisa小老板',
              field: 'handler',
              from: 'KEE',
              to: 'SK',
              at: ago(6),
            },
          ]}
        >
          <PersonVideos
            edited={[]}
            posted={videos.filter((v) => v.postedAt)}
            accountName={new Map(accounts.map((a) => [a.id, a.name]))}
          />
        </HistoryView>
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
          assignments={{
            [acct(1)]: { handlerId: KEE, editorId: MEI },
            [acct(2)]: { handlerId: KEE, editorId: MEI },
            [acct(3)]: { handlerId: ZUWEI, editorId: MEI },
            [acct(4)]: { handlerId: HOWEN, editorId: null },
          }}
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
            },
            {
              userId: 'ffffffff-0000-4000-8000-000000000002',
              email: 'ali.cuts@example.com',
              name: 'ALI',
              kind: 'editor',
              signedUpAt: ago(1),
            },
          ]}
          team={[
            {
              id: KEE,
              name: 'KEE',
              kind: 'handler',
              email: 'kee@example.com',
              edited: 0,
              posted: 7,
              shootsDone: 9,
              profileHref: '#',
            },
            {
              id: ZUWEI,
              name: 'ZUWEI',
              kind: 'handler',
              email: null,
              edited: 0,
              posted: 4,
              shootsDone: 5,
              profileHref: '#',
            },
            {
              id: HOWEN,
              name: 'HOWEN',
              kind: 'handler',
              email: null,
              edited: 0,
              posted: 3,
              shootsDone: 2,
              profileHref: '#',
            },
            {
              id: MEI,
              name: 'MEI',
              kind: 'editor',
              email: 'mei@example.com',
              edited: 14,
              posted: 0,
              shootsDone: 0,
              profileHref: '#',
            },
          ]}
          unlinked={[
            { id: ZUWEI, name: 'ZUWEI' },
            { id: HOWEN, name: 'HOWEN' },
          ]}
        />
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
