import { Metadata } from 'next';
import { DashboardShowcase } from '@gitroom/frontend/components/dashboard-showcase/dashboard-showcase';
import { Badge, LiveBadge } from '@gitroom/frontend/components/ui/badge';
import { Container, Section } from '@gitroom/frontend/components/ui/section';
import {
  getLiveCreatorRows,
  type LiveCreatorRow,
} from '@gitroom/frontend/lib/queries';
import { getDashboardViewTotalsWindowed } from '@gitroom/frontend/lib/metrics-windowed';

// Rendered dynamically (uncached live-DB reads) — see (public)/page.tsx for why
// this is force-dynamic and not build-time ISR.
export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Dashboard — D3 Creator',
  description:
    'Live overview of every creator we grow at D3 — combined views and followers across Instagram, TikTok, Facebook, and Douyin.',
  alternates: { canonical: '/dashboard' },
};

export default async function DashboardPage() {
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
    <Section space="md">
      <Container>
        <header className="mb-10 max-w-prose">
          {/* Only claim "live" when the query actually returned rows. */}
          {isLive ? <LiveBadge>Live</LiveBadge> : <Badge tone="muted">Preview</Badge>}
          <h1 className="mt-6 text-display-2 text-fg">
            Every creator, every platform
          </h1>
          <p className="mt-4 text-body-lg text-fg-muted">
            A roll-up of every account we manage. Pick a platform and a window;
            the figures update as our scraper collects them.
          </p>
          {isLive && (
            <p className="mt-4 text-caption text-fg-subtle">
              <span className="tnum">{creators!.length}</span> creator
              {creators!.length === 1 ? '' : 's'} tracked · followers are the
              latest scraped count, views are summed over the window you select.
            </p>
          )}
        </header>

        <DashboardShowcase
          creators={creators}
          viewsByWindow={windowed?.byPlatform}
          creatorViewsByWindow={windowed?.byCreator}
        />
      </Container>
    </Section>
  );
}
