import type { Metadata } from 'next';
import { headers } from 'next/headers';
import { getI18n } from '@gitroom/frontend/lib/i18n-server';
import { isStaffHost } from '@gitroom/frontend/lib/portal-host';
import { addDays, isDateKey, todayKey } from '@gitroom/frontend/lib/tracker';
import { weekStart } from '@gitroom/frontend/lib/team/shoots';
import { getStaffContext } from '@gitroom/frontend/lib/team/staff-context';
import {
  loadPeople,
  loadRoster,
  loadShoots,
} from '@gitroom/frontend/lib/team/load';
import { Container, Section } from '@gitroom/frontend/components/ui/section';
import { WeekSchedule } from '@gitroom/frontend/components/team/week-schedule';
import { NotLinked } from '@gitroom/frontend/components/team/not-linked';

export const dynamic = 'force-dynamic';

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return { title: t('Schedule — D3 Staff') };
}

interface PageProps {
  searchParams: Promise<{ week?: string }>;
}

/** This week's shoots: the whole team's, yours editable. */
export default async function StaffSchedulePage({ searchParams }: PageProps) {
  const { t } = await getI18n();
  const staff = await getStaffContext();
  const { week } = await searchParams;
  const today = todayKey();
  const start = weekStart(isDateKey(week) ? week : today);
  const basePath = isStaffHost((await headers()).get('host'))
    ? '/schedule'
    : '/staff/schedule';

  const data = staff
    ? await Promise.all([
        loadShoots(start, addDays(start, 7)),
        loadPeople(),
        loadRoster(),
      ])
    : null;

  return (
    <Container>
      <Section space="sm" className="space-y-8">
        <header className="max-w-prose">
          <p className="text-micro uppercase text-fg-subtle">{t('Schedule')}</p>
          <h1 className="mt-3 text-display-2 text-fg">
            {t('Shoot schedule')}
          </h1>
          <p className="mt-3 text-body-lg text-fg-muted">
            {t(
              'When and where everyone is shooting this week. Add yours — the team and the admin see it straight away.',
            )}
          </p>
        </header>

        {staff && data ? (
          <WeekSchedule
            // A new week is a fresh board, not a reconcile of two weeks.
            key={start}
            start={start}
            today={today}
            shoots={data[0]}
            people={data[1].map(({ id, name, archived }) => ({
              id,
              name,
              archived,
            }))}
            accounts={data[2].map(({ id, name }) => ({ id, name }))}
            meId={staff.memberId}
            basePath={basePath}
          />
        ) : (
          <NotLinked />
        )}
      </Section>
    </Container>
  );
}
