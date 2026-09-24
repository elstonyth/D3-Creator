import type { Metadata } from 'next';
import { getI18n } from '@gitroom/frontend/lib/i18n-server';
import { localeTag } from '@gitroom/frontend/lib/i18n';
import { todayKey } from '@gitroom/frontend/lib/tracker';
import { getStaffContext } from '@gitroom/frontend/lib/team/staff-context';
import { loadAccountsAt, loadPeople } from '@gitroom/frontend/lib/team/load';
import { Container, Section } from '@gitroom/frontend/components/ui/section';
import { AccountsView } from '@gitroom/frontend/components/team/accounts-view';
import { NotLinked } from '@gitroom/frontend/components/team/not-linked';

export const dynamic = 'force-dynamic';

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return { title: t('My accounts — D3 Staff') };
}

/** The accounts you handle and edit today, with this month's output. */
export default async function StaffAccountsPage() {
  const { t, locale } = await getI18n();
  const staff = await getStaffContext();
  const month = todayKey().slice(0, 7);
  const accounts = staff
    ? await loadAccountsAt(staff.memberId, month, await loadPeople())
    : null;

  return (
    <Container>
      <Section space="sm" className="space-y-8">
        <header className="max-w-prose">
          <p className="text-micro uppercase text-fg-subtle">
            {t('My accounts')}
          </p>
          <h1 className="mt-3 text-display-2 text-fg">
            {t('What you look after')}
          </h1>
          <p className="mt-3 text-body-lg text-fg-muted">
            {t('Output for {month}, from the scraped posts.', {
              month: new Intl.DateTimeFormat(localeTag(locale), {
                timeZone: 'UTC',
                month: 'long',
                year: 'numeric',
              }).format(new Date(`${month}-01T00:00:00Z`)),
            })}
          </p>
        </header>
        {accounts ? (
          <AccountsView handled={accounts.handled} edited={accounts.edited} />
        ) : (
          <NotLinked />
        )}
      </Section>
    </Container>
  );
}
