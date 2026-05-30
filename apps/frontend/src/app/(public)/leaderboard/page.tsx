import { Metadata } from 'next';
import { LeaderboardShowcase } from '@gitroom/frontend/components/leaderboard-showcase/leaderboard-showcase';
import {
  getCreatorMetricsWindowed,
  getTopContentWindowed,
  type CreatorMetricWindowRow,
  type TopContentRow,
} from '@gitroom/frontend/lib/metrics-windowed';

// ISR: 1h cache, see (public)/page.tsx for rationale.
export const revalidate = 3600;

export const metadata: Metadata = {
  title: 'Leaderboard — D3 Creator',
  description:
    'Top creators we grow at D3, ranked by followers, views, and growth across every platform.',
};

export default async function LeaderboardPage() {
  const [creators, topContent] = await Promise.all([
    getCreatorMetricsWindowed('30d').catch((e) => {
      console.error('[leaderboard] creator metrics', e);
      return [] as CreatorMetricWindowRow[];
    }),
    getTopContentWindowed('30d', { limit: 20 }).catch((e) => {
      console.error('[leaderboard] top content', e);
      return [] as TopContentRow[];
    }),
  ]);

  const insufficient = creators.some((r) => r.insufficient);

  return (
    <div className="flex flex-col gap-10 pt-12 pb-24">
      <header className="max-w-[760px]">
        <span className="inline-flex items-center gap-2 px-3 py-1 rounded-full glass-subtle border border-borderGlass text-caption text-fgMuted mb-6">
          <span className="inline-block size-1.5 rounded-full bg-white/[0.78]" />
          Leaderboard
        </span>
        <h1 className="text-display-2 text-fg mb-4">
          A public leaderboard of the creators built by D3.
        </h1>
        <p className="text-body-lg text-fgMuted max-w-[600px] mb-3">
          Track live followers, views, and growth across TikTok,
          Instagram, Facebook, and more.
        </p>
        <p className="text-body-lg text-fgMuted max-w-[600px]">
          No screenshots. No fake case studies. Just live numbers.
        </p>
        {creators.length > 0 && insufficient && (
          <p className="mt-4 text-caption text-fgSubtle">
            Tracking {creators.length} creator{creators.length === 1 ? '' : 's'} ·
            views fill in as snapshots accrue.
          </p>
        )}
      </header>

      <LeaderboardShowcase liveCreators={creators} topContent={topContent} />
    </div>
  );
}
