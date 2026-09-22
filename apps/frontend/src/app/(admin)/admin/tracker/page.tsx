import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getI18n } from '@gitroom/frontend/lib/i18n-server';
import { getAuthContext } from '@gitroom/frontend/lib/auth';
import { isDateKey, isMonthKey, todayKey } from '@gitroom/frontend/lib/tracker';
import { loadTrackerData } from './data';
import { WorkTracker } from './work-tracker';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return { title: t('Work Tracker — D3 Admin') };
}

interface PageProps {
  searchParams: Promise<{ month?: string; day?: string }>;
}

export default async function TrackerPage({ searchParams }: PageProps) {
  const auth = await getAuthContext();
  if (!auth) redirect('/login');
  if (auth.role !== 'admin') redirect('/me');

  const params = await searchParams;
  const today = todayKey();
  const month = isMonthKey(params.month) ? params.month : today.slice(0, 7);
  const day =
    isDateKey(params.day) && params.day.startsWith(month) ? params.day : null;

  const data = await loadTrackerData(month);

  // Keyed on the month so a month change remounts with fresh server data
  // instead of reconciling two months of optimistic state.
  return <WorkTracker key={month} initial={data} initialDay={day} />;
}
