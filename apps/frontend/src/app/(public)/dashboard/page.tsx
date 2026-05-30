import { Metadata } from 'next';
import { DashboardShowcase } from '@gitroom/frontend/components/dashboard-showcase/dashboard-showcase';
import { getPlatformBreakdown } from '@gitroom/frontend/lib/queries';
import {
  getCreatorMetricsWindowed,
  type CreatorMetricWindowRow,
} from '@gitroom/frontend/lib/metrics-windowed';

// ISR: 1h cache, see (public)/page.tsx for rationale.
export const revalidate = 3600;

export const metadata: Metadata = {
  title: 'Dashboard — D3 Creator',
  description:
    'Live overview of every creator we grow at D3 — views, followers, and growth across Instagram, TikTok, Facebook, and Douyin.',
};

export default async function DashboardPage() {
  const [metrics30d, metricsLifetime, livePlatformBreakdown] = await Promise.all([
    getCreatorMetricsWindowed('30d').catch((e) => {
      console.error('[dashboard] 30d', e);
      return [] as CreatorMetricWindowRow[];
    }),
    getCreatorMetricsWindowed('lifetime').catch((e) => {
      console.error('[dashboard] lifetime', e);
      return [] as CreatorMetricWindowRow[];
    }),
    getPlatformBreakdown().catch((e) => {
      console.error('[dashboard] breakdown', e);
      return null;
    }),
  ]);

  const isLive = metrics30d.length > 0;

  return (
    <div className="flex flex-col gap-10 pt-12 pb-24">
      <header className="max-w-[760px]">
        <span className="inline-flex items-center gap-2 px-3 py-1 rounded-full glass-subtle border border-borderGlass text-caption text-fgMuted mb-6">
          <span className="inline-block size-1.5 rounded-full bg-white/[0.78]" />
          Dashboard
        </span>
        <h1 className="text-display-2 text-fg mb-4">
          Every creator. Every platform.
        </h1>
        <p className="text-body-lg text-fgMuted max-w-[600px]">
          A live roll-up of every account we manage. Filter by platform; numbers
          refresh as our scraper collects them.
        </p>
        {isLive && (
          <p className="mt-4 text-caption text-fgSubtle">
            Tracking {metrics30d.length} creator{metrics30d.length === 1 ? '' : 's'} ·
            growth metrics fill in after 14 days of snapshots.
          </p>
        )}
      </header>

      <DashboardShowcase
        metrics30d={metrics30d}
        metricsLifetime={metricsLifetime}
        livePlatformBreakdown={livePlatformBreakdown}
      />
    </div>
  );
}
