import { getI18n } from '@gitroom/frontend/lib/i18n-server';
import { Metadata } from 'next';
import { DashboardShowcase } from '@gitroom/frontend/components/dashboard-showcase/dashboard-showcase';
import {
  getLiveCreatorRows,
  type LiveCreatorRow,
} from '@gitroom/frontend/lib/queries';
import { getDashboardViewTotalsWindowed } from '@gitroom/frontend/lib/metrics-windowed';

// Rendered dynamically (uncached live-DB reads) — see (public)/page.tsx for why
// this is force-dynamic and not build-time ISR.
export const dynamic = 'force-dynamic';

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return {
    title: t('Dashboard — D3 Creator'),
    description: t(
      'Live overview of every creator we grow at D3 — combined views and followers across Instagram, TikTok, Facebook, and Douyin.'
    ),
    alternates: { canonical: '/dashboard' },
  };
}

export default async function DashboardPage() {
  const { t } = await getI18n();
  const [creators, windowed] = await Promise.all([
    getLiveCreatorRows().catch((e) => {
      console.error('[dashboard] creators', e);
      return null as LiveCreatorRow[] | null;
    }),
    // Windowed view totals power the period pills across the hero, platform
    // breakdown, and Top Creators ranking. Resolves to empty maps on error
    // (logged inside the helper) so those sections fall back to cumulative.
    getDashboardViewTotalsWindowed().catch((e) => {
      console.error('[dashboard] viewsByWindow', e);
      return undefined;
    }),
  ]);

  const isLive = !!(creators && creators.length > 0);

  return (
    <div className="flex flex-col gap-10 pt-12 pb-24">
      <header className="max-w-[760px]">
        <span className="inline-flex items-center gap-2 px-3 py-1 rounded-full glass-subtle border border-borderGlass text-caption text-fgMuted mb-6">
          <span className="inline-block size-1.5 rounded-full bg-white/[0.78]" />
          {t('Dashboard')}{' '}
        </span>
        <h1 className="text-display-2 text-fg mb-4">
          {t('Every creator. Every platform.')}{' '}
        </h1>
        <p className="text-body-lg text-fgMuted max-w-[600px]">
          {t(
            'A live roll-up of every account we manage. Filter by platform; numbers refresh as our scraper collects them.'
          )}{' '}
        </p>
        {isLive && (
          <p className="mt-4 text-caption text-fgSubtle">
            {t(
              creators.length === 1
                ? 'Tracking {count} creator · combined followers and views across every platform.'
                : 'Tracking {count} creators · combined followers and views across every platform.',
              { count: creators.length }
            )}{' '}
          </p>
        )}
      </header>

      <DashboardShowcase
        creators={creators}
        viewsByWindow={windowed?.byPlatform}
        creatorViewsByWindow={windowed?.byCreator}
      />
    </div>
  );
}
