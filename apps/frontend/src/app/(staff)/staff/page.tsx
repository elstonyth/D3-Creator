import type { Metadata } from 'next';
import { getI18n } from '@gitroom/frontend/lib/i18n-server';
import { isDateKey, isMonthKey, todayKey } from '@gitroom/frontend/lib/tracker';
import { getStaffContext } from '@gitroom/frontend/lib/team/staff-context';
import { loadStaffTracker } from '@gitroom/frontend/lib/team/tracker-data';
import { Container, Section } from '@gitroom/frontend/components/ui/section';
import { StaffTracker } from '@gitroom/frontend/components/team/staff-tracker';
import { NotLinked } from '@gitroom/frontend/components/team/not-linked';

export const dynamic = 'force-dynamic';

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return { title: t('Work Tracker — D3 Staff') };
}

interface PageProps {
  searchParams: Promise<{ month?: string; day?: string }>;
}

/**
 * The staff home: your own Work Tracker. Your shoots, the videos you passed
 * on to the editors and whether they are verified, and what waits for you.
 * Read for the signed-in person only (loadStaffTracker), never the team.
 */
export default async function StaffTrackerPage({ searchParams }: PageProps) {
  const staff = await getStaffContext();
  if (!staff)
    return (
      <Container>
        <Section space="sm">
          <NotLinked />
        </Section>
      </Container>
    );

  const params = await searchParams;
  const today = todayKey();
  const month = isMonthKey(params.month) ? params.month : today.slice(0, 7);
  const day =
    isDateKey(params.day) && params.day.startsWith(month) ? params.day : null;
  const data = await loadStaffTracker(staff.memberId, month, today);

  return (
    <StaffTracker
      // A month change remounts with that month's data instead of
      // reconciling two months of local state.
      key={month}
      {...data}
      month={month}
      today={today}
      initialDay={day}
      meId={staff.memberId}
    />
  );
}
