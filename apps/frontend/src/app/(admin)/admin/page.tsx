import { getI18n } from '@gitroom/frontend/lib/i18n-server';
import { localeTag } from '@gitroom/frontend/lib/i18n';
import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getSupabaseAdmin } from '@d3/database';
import { getAuthContext } from '@gitroom/frontend/lib/auth';
import {
  getCreatorMetricsWindowed,
  getTopContentWindowed,
} from '@gitroom/frontend/lib/metrics-windowed';
import { rankCreatorsByFollowerDelta } from '@gitroom/frontend/lib/admin-top30';
import { ViewLeaderboard } from '@gitroom/frontend/components/leaderboard-showcase/view-leaderboard';
import { Container, Section } from '@gitroom/frontend/components/ui/section';
import { Card } from '@gitroom/frontend/components/ui/card';
import { Stat, StatRow } from '@gitroom/frontend/components/ui/stat';
import { Top30Creators } from './top30-creators';
import { ProvisionForm } from './provision-form';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return { title: t('Admin — D3 Creator') };
}

export default async function AdminPage() {
  const { t, locale } = await getI18n();
  // Defense-in-depth: layout already gates on role=admin, but re-check here
  // before touching service-role.
  const auth = await getAuthContext();
  if (!auth) redirect('/login');
  if (auth.role !== 'admin') redirect('/me');

  const admin = getSupabaseAdmin();

  const [
    { count: creatorCount },
    { count: profileCount },
    { count: userCount },
    creatorMetrics,
    topContent,
  ] = await Promise.all([
    admin.from('creator').select('*', { count: 'exact', head: true }),
    admin.from('profile').select('*', { count: 'exact', head: true }),
    admin.from('user_role').select('*', { count: 'exact', head: true }),
    getCreatorMetricsWindowed('30d', { client: admin }),
    getTopContentWindowed('30d', { client: admin, limit: 30 }),
  ]);

  // Every tile says what it counts AND over what window — the single biggest
  // source of confusion on this product is which window a number covers.
  const stats = [
    {
      label: 'Creators',
      value: creatorCount ?? 0,
      meta: 'Accounts on the roster',
    },
    {
      label: 'Platform profiles',
      value: profileCount ?? 0,
      meta: 'Scrape targets across all platforms',
    },
    {
      label: 'Users',
      value: userCount ?? 0,
      meta: 'Sign-ins with a role assigned',
    },
  ];
  const rankedCreators = rankCreatorsByFollowerDelta(creatorMetrics).slice(
    0,
    30,
  );

  return (
    <Container>
      <Section space="sm" className="space-y-10">
        <header className="max-w-prose">
          <p className="text-micro uppercase text-fg-subtle">{t('Overview')}</p>
          <h1 className="mt-3 text-display-2 text-fg">{t('Agency console')}</h1>
          <p className="mt-3 text-body-lg text-fg-muted">
            {t(
              'Roster size, thirty-day movers, and the form that puts a new creator in the system. Everything here reads live — no cache.',
            )}
          </p>
        </header>

        <div className="space-y-3">
          <StatRow>
            {stats.map((s) => (
              <Stat
                key={s.label}
                label={t(s.label)}
                value={Intl.NumberFormat(localeTag(locale)).format(s.value)}
                meta={t(s.meta)}
              />
            ))}
          </StatRow>
          <p className="text-caption text-fg-subtle">
            <Link
              href="/admin/profiles"
              className="text-fg-muted underline underline-offset-4 transition-colors duration-150 ease-out hover:text-fg focus-visible:outline-none focus-visible:shadow-focus"
            >
              {t('Review every account to see per-profile scrape health.')}
            </Link>
          </p>
        </div>

        <section aria-labelledby="provision-heading" className="space-y-4">
          <div className="max-w-prose">
            <h2 id="provision-heading" className="text-section text-fg">
              {t('Provision a creator')}
            </h2>
            <p className="mt-2 text-body text-fg-muted">
              {t(
                'Creates the login and attaches social URLs in one step. The password is shown once, right here, and never again — copy it before you leave the page.',
              )}
            </p>
          </div>
          <Card tone="subtle" padding="lg">
            <ProvisionForm />
          </Card>
        </section>

        <section aria-labelledby="movers-heading" className="space-y-4">
          <div className="max-w-prose">
            <h2 id="movers-heading" className="text-section text-fg">
              {t('Thirty-day movers')}
            </h2>
            <p className="mt-2 text-body text-fg-muted">
              {t(
                'Ranked on change since 30 days ago. Accounts with less than a full window of history are marked instead of ranked.',
              )}
            </p>
          </div>
          <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-2">
            <Top30Creators rows={rankedCreators} />
            <ViewLeaderboard
              rows={topContent}
              title={t('Top Content')}
              subtitle={t('Top 30 by views · last 30 days')}
            />
          </div>
        </section>
      </Section>
    </Container>
  );
}
