import { getI18n } from '@gitroom/frontend/lib/i18n-server';
import { Metadata } from 'next';
import { LeaderboardShowcase } from '@gitroom/frontend/components/leaderboard-showcase/leaderboard-showcase';
import {
  getLiveCreatorRows,
  getTopContentRankingsWindowed,
  type LiveCreatorRow,
} from '@gitroom/frontend/lib/queries';

// Rendered dynamically (uncached live-DB reads) — see (public)/page.tsx for why
// this is force-dynamic and not build-time ISR.
export const dynamic = 'force-dynamic';

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return {
    title: t('Leaderboard — D3 Creator'),
    description: t(
      'Top creators we grow at D3, ranked by followers, views, and engagement across every platform.'
    ),
    alternates: { canonical: '/leaderboard' },
  };
}

export default async function LeaderboardPage() {
  const { t } = await getI18n();
  const [creators, content] = await Promise.all([
    getLiveCreatorRows().catch((e) => {
      console.error('[leaderboard] creators', e);
      return null as LiveCreatorRow[] | null;
    }),
    getTopContentRankingsWindowed(50).catch((e) => {
      console.error('[leaderboard] top content', e);
      return null;
    }),
  ]);

  return (
    <div className="flex flex-col gap-8 pt-12 pb-24">
      <header className="max-w-[760px]">
        <span className="inline-flex items-center gap-2 px-3 py-1 rounded-full glass-subtle border border-borderGlass text-caption text-fgMuted mb-6">
          <span className="inline-block size-1.5 rounded-full bg-white/[0.78]" />
          {t('Leaderboard')}{' '}
        </span>
        <h1 className="text-display-2 text-fg mb-4">
          {t('A public leaderboard of the creators built by D3.')}{' '}
        </h1>
        <p className="text-body-lg text-fgMuted max-w-[600px]">
          {t(
            'Top creators by views, and their best content by views and engagement. No screenshots. No fake case studies. Just live numbers.'
          )}{' '}
        </p>
      </header>

      <LeaderboardShowcase
        liveCreators={creators}
        topContentByWindow={content}
      />
    </div>
  );
}
