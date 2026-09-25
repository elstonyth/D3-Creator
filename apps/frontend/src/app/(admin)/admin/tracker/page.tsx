import type { Metadata } from 'next';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { getI18n } from '@gitroom/frontend/lib/i18n-server';
import { getAuthContext } from '@gitroom/frontend/lib/auth';
import { isAdminHost } from '@gitroom/frontend/lib/portal-host';
import { isDateKey, isMonthKey, todayKey } from '@gitroom/frontend/lib/tracker';
import { loadAdminTracker } from '@gitroom/frontend/lib/team/tracker-data';
import { AdminTracker } from '@gitroom/frontend/components/team/admin-tracker';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return { title: t('Work Tracker — D3 Admin') };
}

interface PageProps {
  searchParams: Promise<{ month?: string; day?: string }>;
}

/**
 * Everyone's Work Tracker, read-only: the shoots staff schedule, the videos
 * they pass on, who edits and who verifies each, as they update their own.
 */
export default async function AdminTrackerPage({ searchParams }: PageProps) {
  const auth = await getAuthContext();
  if (!auth) redirect('/login');
  if (auth.role !== 'admin') redirect('/me');

  const params = await searchParams;
  const today = todayKey();
  const month = isMonthKey(params.month) ? params.month : today.slice(0, 7);
  const day =
    isDateKey(params.day) && params.day.startsWith(month) ? params.day : null;
  const profileBase = isAdminHost((await headers()).get('host'))
    ? '/team'
    : '/admin/team';
  const data = await loadAdminTracker(month, today);

  return (
    <AdminTracker
      // A month change remounts with that month's data.
      key={month}
      {...data}
      month={month}
      today={today}
      initialDay={day}
      profileBase={profileBase}
    />
  );
}
