import type { Metadata } from 'next';
import { headers } from 'next/headers';
import { getI18n } from '@gitroom/frontend/lib/i18n-server';
import { isStaffHost } from '@gitroom/frontend/lib/portal-host';
import {
  isMonthKey,
  monthRange,
  todayKey,
} from '@gitroom/frontend/lib/tracker';
import { getStaffContext } from '@gitroom/frontend/lib/team/staff-context';
import {
  loadAccountsAt,
  loadPeople,
  loadRoster,
  loadShoots,
  loadVideosDone,
  monthDays,
} from '@gitroom/frontend/lib/team/load';
import { Container, Section } from '@gitroom/frontend/components/ui/section';
import { HistoryView } from '@gitroom/frontend/components/team/history-view';
import { NotLinked } from '@gitroom/frontend/components/team/not-linked';
import { PersonVideos } from '@gitroom/frontend/components/team/person-videos';
import { finishedBy } from '@gitroom/frontend/lib/team/videos';

export const dynamic = 'force-dynamic';

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return { title: t('History — D3 Staff') };
}

interface PageProps {
  searchParams: Promise<{ month?: string }>;
}

/** Your record, month by month: shoots, videos, accounts, handovers. */
export default async function StaffHistoryPage({ searchParams }: PageProps) {
  const { t } = await getI18n();
  const staff = await getStaffContext();
  const thisMonth = todayKey().slice(0, 7);
  const { month: asked } = await searchParams;
  const month = isMonthKey(asked) && asked <= thisMonth ? asked : thisMonth;
  const base = isStaffHost((await headers()).get('host'))
    ? '/history'
    : '/staff/history';

  let body = <NotLinked />;
  if (staff) {
    const { from, to } = monthDays(month);
    const people = await loadPeople();
    const range = monthRange(month);
    const start = new Date(range.from).toISOString();
    const end = new Date(range.to).toISOString();
    const [shoots, roster, accounts, videos] = await Promise.all([
      loadShoots(from, to, staff.memberId),
      loadRoster(),
      loadAccountsAt(staff.memberId, month, people),
      loadVideosDone(start, end, staff.memberId),
    ]);
    const mine = finishedBy(videos, staff.memberId, start, end);
    const accountName = new Map(roster.map((a) => [a.id, a.name]));
    body = (
      <HistoryView
        month={month}
        thisMonth={thisMonth}
        monthHref={(m) => `${base}?month=${m}`}
        shoots={shoots}
        accountName={accountName}
        {...accounts}
      >
        <PersonVideos
          edited={mine.edited}
          posted={mine.posted}
          accountName={accountName}
        />
      </HistoryView>
    );
  }

  return (
    <Container>
      <Section space="sm" className="space-y-8">
        <header className="max-w-prose">
          <p className="text-micro uppercase text-fg-subtle">{t('History')}</p>
          <h1 className="mt-3 text-display-2 text-fg">{t('Your record')}</h1>
          <p className="mt-3 text-body-lg text-fg-muted">
            {t(
              'Every shoot you logged, the videos that came out of them, and the accounts you held that month.',
            )}
          </p>
        </header>
        {body}
      </Section>
    </Container>
  );
}
