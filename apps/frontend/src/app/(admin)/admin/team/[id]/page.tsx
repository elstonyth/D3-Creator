import type { Metadata } from 'next';
import { headers } from 'next/headers';
import { notFound, redirect } from 'next/navigation';
import Link from 'next/link';
import { getSupabaseAdmin } from '@d3/database';
import { getI18n } from '@gitroom/frontend/lib/i18n-server';
import { getAuthContext } from '@gitroom/frontend/lib/auth';
import { isUuid } from '@gitroom/frontend/lib/ids';
import { isAdminHost } from '@gitroom/frontend/lib/portal-host';
import {
  isMonthKey,
  monthRange,
  todayKey,
} from '@gitroom/frontend/lib/tracker';
import {
  loadPeople,
  loadRoster,
  loadShoots,
  loadVideosDone,
  monthDays,
} from '@gitroom/frontend/lib/team/load';
import { finishedBy } from '@gitroom/frontend/lib/team/videos';
import { Pill } from '@gitroom/frontend/components/team/pill';
import { Container, Section } from '@gitroom/frontend/components/ui/section';
import { HistoryView } from '@gitroom/frontend/components/team/history-view';
import { PersonVideos } from '@gitroom/frontend/components/team/person-videos';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return { title: t('Profile — D3 Admin') };
}

interface PageProps {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ month?: string }>;
}

/**
 * One person's record for a month, read-only: their shoots and the videos
 * they edited or verified, with the editors' links.
 */
export default async function AdminPersonPage({
  params,
  searchParams,
}: PageProps) {
  const { t } = await getI18n();
  const auth = await getAuthContext();
  if (!auth) redirect('/login');
  if (auth.role !== 'admin') redirect('/me');

  const { id } = await params;
  if (!isUuid(id)) notFound();
  const people = await loadPeople();
  const person = people.find((p) => p.id === id);
  if (!person) notFound();

  const thisMonth = todayKey().slice(0, 7);
  const { month: asked } = await searchParams;
  const month = isMonthKey(asked) && asked <= thisMonth ? asked : thisMonth;
  const { from, to } = monthRange(month);
  const days = monthDays(month);
  const base = isAdminHost((await headers()).get('host'))
    ? `/team/${id}`
    : `/admin/team/${id}`;
  const teamHref = isAdminHost((await headers()).get('host'))
    ? '/team'
    : '/admin/team';

  const admin = getSupabaseAdmin();
  const [shoots, roster, videos, login] = await Promise.all([
    loadShoots(days.from, days.to, id),
    loadRoster(),
    loadVideosDone(
      new Date(from).toISOString(),
      new Date(to).toISOString(),
      id,
    ),
    admin.from('tracker_member').select('user_id').eq('id', id).maybeSingle(),
  ]);
  const userId = login.data?.user_id as string | null | undefined;
  const email = userId
    ? ((await admin.auth.admin.getUserById(userId)).data.user?.email ?? null)
    : null;

  const { edited, verified } = finishedBy(
    videos,
    id,
    new Date(from).toISOString(),
    new Date(to).toISOString(),
  );
  const accountName = new Map(roster.map((a) => [a.id, a.name]));

  return (
    <Container>
      <Section space="sm" className="space-y-8">
        <header className="max-w-prose">
          <Link
            href={teamHref}
            className="rounded text-caption text-fg-muted hover:text-fg focus-visible:outline-none focus-visible:shadow-focusRing"
          >
            ← {t('The team')}
          </Link>
          <h1 className="mt-3 flex flex-wrap items-center gap-3 text-display-2 text-fg">
            {person.name}
            <Pill tone="muted">
              {person.kind === 'both'
                ? t('Handler & editor')
                : person.kind === 'editor'
                  ? t('Editor')
                  : t('Handler')}
            </Pill>
            {person.archived ? (
              <Pill tone="muted">{t('Left the board')}</Pill>
            ) : null}
          </h1>
          <p className="mt-3 break-all text-body text-fg-muted">
            {email ?? t('No login yet')}
          </p>
        </header>

        <HistoryView
          month={month}
          thisMonth={thisMonth}
          monthHref={(m) => `${base}?month=${m}`}
          shoots={shoots}
          accountName={accountName}
          edited={edited.length}
          verified={verified.length}
        >
          <PersonVideos
            edited={edited}
            verified={verified}
            accountName={accountName}
          />
        </HistoryView>
      </Section>
    </Container>
  );
}
