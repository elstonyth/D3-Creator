import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getI18n } from '@gitroom/frontend/lib/i18n-server';
import { getAuthContext } from '@gitroom/frontend/lib/auth';
import { monthRange, todayKey } from '@gitroom/frontend/lib/tracker';
import {
  loadPeople,
  loadRoster,
  loadVideos,
} from '@gitroom/frontend/lib/team/load';
import { Container, Section } from '@gitroom/frontend/components/ui/section';
import { VideoBoard } from '@gitroom/frontend/components/team/video-board';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return { title: t('Videos — D3 Admin') };
}

/**
 * Every video in hand, read-only: who is editing it now, who is to verify
 * it, and what was verified this month, with the links the editors pasted.
 */
export default async function AdminVideosPage() {
  const { t } = await getI18n();
  const auth = await getAuthContext();
  if (!auth) redirect('/login');
  if (auth.role !== 'admin') redirect('/me');

  const month = todayKey().slice(0, 7);
  const [videos, people, roster] = await Promise.all([
    loadVideos(new Date(monthRange(month).from).toISOString()),
    loadPeople(),
    loadRoster(),
  ]);

  return (
    <Container>
      <Section space="sm" className="space-y-8">
        <header className="max-w-prose">
          <p className="text-micro uppercase text-fg-subtle">{t('Videos')}</p>
          <h1 className="mt-3 text-display-2 text-fg">{t('Video jobs')}</h1>
          <p className="mt-3 text-body-lg text-fg-muted">
            {t(
              'Who is editing each video now, and who verifies it next. Staff pass videos on from their shoots; each Done and Verify counts toward their month.',
            )}
          </p>
        </header>
        <VideoBoard
          videos={videos}
          people={people}
          accounts={roster.map(({ id, name }) => ({ id, name }))}
          meId={null}
          month={month}
          readOnly
        />
      </Section>
    </Container>
  );
}
