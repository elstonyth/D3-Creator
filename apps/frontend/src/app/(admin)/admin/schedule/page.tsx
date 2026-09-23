import type { Metadata } from 'next';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { getI18n } from '@gitroom/frontend/lib/i18n-server';
import { getAuthContext } from '@gitroom/frontend/lib/auth';
import { isAdminHost } from '@gitroom/frontend/lib/portal-host';
import { addDays, isDateKey, todayKey } from '@gitroom/frontend/lib/tracker';
import { weekStart } from '@gitroom/frontend/lib/team/shoots';
import {
  loadPeople,
  loadRoster,
  loadShoots,
} from '@gitroom/frontend/lib/team/load';
import { Container, Section } from '@gitroom/frontend/components/ui/section';
import { WeekSchedule } from '@gitroom/frontend/components/team/week-schedule';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return { title: t('Schedule — D3 Admin') };
}

interface PageProps {
  searchParams: Promise<{ week?: string }>;
}

/** Everyone's shoots for a week; the admin can add or change any of them. */
export default async function AdminSchedulePage({ searchParams }: PageProps) {
  const { t } = await getI18n();
  const auth = await getAuthContext();
  if (!auth) redirect('/login');
  if (auth.role !== 'admin') redirect('/me');

  const { week } = await searchParams;
  const today = todayKey();
  const start = weekStart(isDateKey(week) ? week : today);
  const basePath = isAdminHost((await headers()).get('host'))
    ? '/schedule'
    : '/admin/schedule';
  const [shoots, people, roster] = await Promise.all([
    loadShoots(start, addDays(start, 7)),
    loadPeople(),
    loadRoster(),
  ]);

  return (
    <Container>
      <Section space="sm" className="space-y-8">
        <header className="max-w-prose">
          <p className="text-micro uppercase text-fg-subtle">{t('Schedule')}</p>
          <h1 className="mt-3 text-display-2 text-fg">{t('Shoot schedule')}</h1>
          <p className="mt-3 text-body-lg text-fg-muted">
            {t(
              'When and where the team is shooting. Staff fill in their own; you can add or change anyone’s.',
            )}
          </p>
        </header>
        <WeekSchedule
          key={start}
          start={start}
          today={today}
          shoots={shoots}
          people={people.map(({ id, name, archived }) => ({
            id,
            name,
            archived,
          }))}
          accounts={roster.map(({ id, name }) => ({ id, name }))}
          meId={null}
          basePath={basePath}
        />
      </Section>
    </Container>
  );
}
