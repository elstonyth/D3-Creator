import type { Metadata } from 'next';
import { getI18n } from '@gitroom/frontend/lib/i18n-server';
import { monthRange, todayKey } from '@gitroom/frontend/lib/tracker';
import { getStaffContext } from '@gitroom/frontend/lib/team/staff-context';
import {
  loadMyTasks,
  loadPeople,
  loadRoster,
  loadVideos,
} from '@gitroom/frontend/lib/team/load';
import { Container, Section } from '@gitroom/frontend/components/ui/section';
import { MyTasks } from '@gitroom/frontend/components/team/my-tasks';
import { VideoBoard } from '@gitroom/frontend/components/team/video-board';
import { NotLinked } from '@gitroom/frontend/components/team/not-linked';

export const dynamic = 'force-dynamic';

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return { title: t('My work — D3 Staff') };
}

/**
 * The staff home: what the admin gave you. Tasks to tick off, and the video
 * jobs you edit or post — Done with a link when your step is finished.
 */
export default async function StaffWorkPage() {
  const { t } = await getI18n();
  const staff = await getStaffContext();
  const month = todayKey().slice(0, 7);

  const data = staff
    ? await Promise.all([
        loadMyTasks(staff.memberId),
        loadVideos(
          new Date(monthRange(month).from).toISOString(),
          staff.memberId,
        ),
        loadPeople(),
        loadRoster(),
      ])
    : null;

  return (
    <Container>
      <Section space="sm" className="space-y-10">
        <header className="max-w-prose">
          <p className="text-micro uppercase text-fg-subtle">{t('My work')}</p>
          <h1 className="mt-3 text-display-2 text-fg">
            {staff ? t('Hi, {name}', { name: staff.name }) : t('My work')}
          </h1>
          <p className="mt-3 text-body-lg text-fg-muted">
            {t(
              'What the admin gave you. When your part of a video is finished, click Done and paste the link — the admin sees it straight away.',
            )}
          </p>
        </header>

        {staff && data ? (
          <>
            <MyTasks tasks={data[0]} />
            <section aria-label={t('Videos')} className="space-y-3">
              <h2 className="text-subsection text-fg">{t('Videos')}</h2>
              <VideoBoard
                videos={data[1]}
                people={data[2]}
                accounts={data[3].map(({ id, name }) => ({ id, name }))}
                meId={staff.memberId}
              />
            </section>
          </>
        ) : (
          <NotLinked />
        )}
      </Section>
    </Container>
  );
}
