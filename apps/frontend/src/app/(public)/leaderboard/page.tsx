import { Metadata } from 'next';
import { LeaderboardShowcase } from '@gitroom/frontend/components/leaderboard-showcase/leaderboard-showcase';
import { Container, Section } from '@gitroom/frontend/components/ui/section';
import { LiveBadge } from '@gitroom/frontend/components/ui/badge';
import {
  getLiveCreatorRows,
  getTopContentRankingsWindowed,
  type LiveCreatorRow,
} from '@gitroom/frontend/lib/queries';

// Rendered dynamically (uncached live-DB reads) — see (public)/page.tsx for why
// this is force-dynamic and not build-time ISR.
export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Leaderboard — D3 Creator',
  description:
    'Top creators we grow at D3, ranked by followers, views, and engagement across every platform.',
  alternates: { canonical: '/leaderboard' },
};

export default async function LeaderboardPage() {
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
    <>
      <Section space="md">
        <Container>
          <div className="max-w-prose">
            <LiveBadge>Updated daily</LiveBadge>
            <h1 className="mt-5 text-display-2 text-fg">
              Every creator we grow, ranked by the numbers.
            </h1>
            <p className="mt-4 text-body-lg text-fg-muted">
              Creators ordered by total views across their tracked posts, then
              the individual posts that pulled the most views and the most
              interactions. Straight from the daily scrape — no screenshots, no
              case studies.
            </p>
          </div>
        </Container>
      </Section>

      <Section space="md" divided>
        <Container>
          <LeaderboardShowcase
            liveCreators={creators}
            topContentByWindow={content}
          />
        </Container>
      </Section>
    </>
  );
}
