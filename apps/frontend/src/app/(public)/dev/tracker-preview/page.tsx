import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { getAuthContext } from '@gitroom/frontend/lib/auth';
import { WorkTracker } from '@gitroom/frontend/app/(admin)/admin/tracker/work-tracker';
import {
  addDays,
  todayKey,
  type TrackerData,
} from '@gitroom/frontend/lib/tracker';

export const metadata: Metadata = {
  title: 'Tracker preview — D3 Creator',
  robots: { index: false, follow: false },
};

export const dynamic = 'force-dynamic';

/**
 * Scratch preview route — the /admin/tracker board on sample data, so the
 * layout and the drag-and-drop can be inspected without an admin session.
 * Every write still goes through the real server actions and is refused
 * (requireAdmin), which also exercises the rollback path. Dev only: 404 in
 * production. Not linked from anywhere.
 */
export default async function TrackerPreviewPage() {
  if (process.env.NODE_ENV === 'production') notFound();
  // A signed-in admin has the real board; the sample one only confuses.
  const auth = await getAuthContext();
  if (auth?.role === 'admin') redirect('/admin/tracker');

  const today = todayKey();
  const month = today.slice(0, 7);
  const members = [
    {
      id: 'aaaaaaaa-0000-4000-8000-000000000001',
      name: 'KEE',
      role: 'Trader',
      kind: 'handler' as const,
      sortOrder: 0,
    },
    {
      id: 'aaaaaaaa-0000-4000-8000-000000000002',
      name: 'ZUWEI',
      role: 'Trader',
      kind: 'handler' as const,
      sortOrder: 1,
    },
    {
      id: 'aaaaaaaa-0000-4000-8000-000000000003',
      name: 'HOWEN',
      role: 'Trader',
      kind: 'handler' as const,
      sortOrder: 2,
    },
    {
      id: 'aaaaaaaa-0000-4000-8000-000000000004',
      name: 'MEI',
      role: 'Editor',
      kind: 'editor' as const,
      sortOrder: 3,
    },
  ];
  const creator = (
    n: number,
    name: string,
    platforms: string[],
    videos: number,
    views: number,
    handler: number | null,
    editor: number | null,
    scheduled = false,
  ) => ({
    id: `bbbbbbbb-0000-4000-8000-0000000000${String(n).padStart(2, '0')}`,
    name,
    avatarUrl: null,
    platforms,
    handlerId: handler === null ? null : members[handler].id,
    editorId: editor === null ? null : members[editor].id,
    scheduledPosting: scheduled,
    sortOrder: n,
    videos,
    posts: videos * 2,
    views,
  });
  const data: TrackerData = {
    month,
    today,
    members,
    tasks: [
      {
        id: 'cccccccc-0000-4000-8000-000000000001',
        title: 'Cut 3 reels for 做火锅的老黄',
        done: false,
        sortOrder: 0,
      },
      {
        id: 'cccccccc-0000-4000-8000-000000000002',
        title: 'Confirm October shoot schedule',
        done: false,
        sortOrder: 1,
      },
      {
        id: 'cccccccc-0000-4000-8000-000000000003',
        title: 'Send September report to Master Michelle',
        done: false,
        sortOrder: 2,
      },
      {
        id: 'cccccccc-0000-4000-8000-000000000004',
        title: 'Renew TikHub credits',
        done: true,
        sortOrder: 3,
      },
    ],
    events: [
      {
        id: 'dddddddd-0000-4000-8000-000000000001',
        date: today,
        title: 'Shoot day · 卖海鲜的Gary (10am)',
      },
      {
        id: 'dddddddd-0000-4000-8000-000000000002',
        date: today,
        title: 'Client call · Provisa 4pm',
      },
      {
        id: 'dddddddd-0000-4000-8000-000000000003',
        date: addDays(today, 1),
        title: 'Post 老头子阿玮 reel #4',
      },
      {
        id: 'dddddddd-0000-4000-8000-000000000004',
        date: addDays(today, 3),
        title: 'Monthly review',
      },
    ],
    creators: [
      creator(
        1,
        '做火锅的老黄',
        ['douyin', 'facebook', 'instagram'],
        12,
        1009974,
        0,
        1,
      ),
      creator(
        2,
        'Master Michelle',
        ['facebook', 'instagram', 'tiktok'],
        22,
        974533,
        0,
        0,
        true,
      ),
      creator(
        3,
        '老头子阿玮',
        ['douyin', 'facebook', 'instagram', 'tiktok'],
        19,
        950316,
        1,
        2,
        true,
      ),
      creator(
        4,
        '卖海鲜的Gary',
        ['douyin', 'facebook', 'instagram', 'tiktok'],
        9,
        412000,
        1,
        3,
      ),
      creator(
        5,
        'Provisa小老板',
        ['douyin', 'facebook', 'instagram', 'tiktok'],
        14,
        380211,
        2,
        2,
      ),
      creator(
        6,
        '做美容的Colly',
        ['douyin', 'facebook', 'instagram', 'tiktok'],
        6,
        120400,
        null,
        null,
      ),
      creator(
        7,
        '开密室的Josh',
        ['douyin', 'facebook', 'instagram', 'rednote', 'tiktok'],
        0,
        0,
        null,
        null,
      ),
    ],
    remarks: 'Studio lights fixed. Colly wants shorter hooks next month.',
  };

  return (
    <>
      <p className="relative z-20 mx-auto mt-6 w-full max-w-[1320px] rounded-2xl border border-brand/40 bg-brand/10 px-5 py-3 text-body-sm text-fg">
        Sample data — nothing here saves.{' '}
        <Link
          href="/login?redirectTo=/admin/tracker"
          className="font-medium underline underline-offset-4"
        >
          Sign in as admin
        </Link>{' '}
        to use the real board.
      </p>
      <WorkTracker key={month} initial={data} initialDay={null} />
    </>
  );
}
