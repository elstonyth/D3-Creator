import type { Metadata } from 'next';
import { getI18n } from '@gitroom/frontend/lib/i18n-server';
import { monthRange, todayKey } from '@gitroom/frontend/lib/tracker';
import { getStaffContext } from '@gitroom/frontend/lib/team/staff-context';
import {
  loadPeople,
  loadRoster,
  loadVideos,
} from '@gitroom/frontend/lib/team/load';
import { Container, Section } from '@gitroom/frontend/components/ui/section';
import { VideoBoard } from '@gitroom/frontend/components/team/video-board';
import { NotLinked } from '@gitroom/frontend/components/team/not-linked';

export const dynamic = 'force-dynamic';

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return { title: t('My work — D3 Staff') };
}

/**
 * The staff home: the videos in your hands. Ones to edit, cuts to verify
 * from shoots you passed on, those still with their editor, and what you
 * finished this month.
 */
export default async function StaffWorkPage() {
  const { t } = await getI18n();
  const staff = await getStaffContext();
  const month = todayKey().slice(0, 7);

  const data = staff
    ? await Promise.all([
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
              'Edit a video, then click Done. Videos you passed on come back here to verify once their editor is done.',
            )}
          </p>
        </header>

        {staff && data ? (
          <VideoBoard
            videos={data[0]}
            people={data[1]}
            accounts={data[2].map(({ id, name }) => ({ id, name }))}
            meId={staff.memberId}
            month={month}
          />
        ) : (
          <NotLinked />
        )}
      </Section>
    </Container>
  );
}
