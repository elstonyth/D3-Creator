import { Metadata } from 'next';
import Link from 'next/link';
import { ButtonLink } from '@gitroom/frontend/components/ui/button';
import { Card } from '@gitroom/frontend/components/ui/card';
import { Badge, LiveBadge } from '@gitroom/frontend/components/ui/badge';
import { Alert } from '@gitroom/frontend/components/ui/alert';
import { Reveal } from '@gitroom/frontend/components/ui/reveal';
import {
  Container,
  Section,
  SectionHeader,
} from '@gitroom/frontend/components/ui/section';
import {
  Table,
  TableWrap,
  Td,
  Th,
  Tr,
  Rank,
} from '@gitroom/frontend/components/ui/table';
import { ImageWithFallback } from '@gitroom/frontend/components/ui/image-with-fallback';
import {
  PLATFORM_ICONS,
  PLATFORM_LABELS,
  type PlatformKey,
} from '@gitroom/frontend/components/ui/platform-icons';
import {
  exactFormatter,
  formatShowcase,
  handleToSlug,
  demoCreatorRows,
} from '@gitroom/frontend/components/dashboard-showcase/showcase-data';
import { ShowcaseNumber } from '@gitroom/frontend/components/dashboard-showcase/showcase-number';
import {
  getLiveCreatorRows,
  summarizeCreatorRows,
  platformBreakdownFromRows,
  type LivePlatformBreakdown,
} from '@gitroom/frontend/lib/queries';
import { SITE_NAME, SITE_URL } from '@gitroom/frontend/lib/site';

// These public pages read live per-request data from Supabase with UNCACHED
// reads, so Next renders them dynamically — production confirms this
// (Cache-Control: private, no-store; X-Vercel-Cache: MISS). The previous
// `revalidate = 3600` never actually produced static ISR. Mark them
// `force-dynamic` so `next build` does NOT prerender them: that build-time
// render executed getLiveCreatorRows() — a full profile_snapshot + post_snapshot
// scan — and intermittently exceeded the 60s static-generation timeout, flaking
// CI (/leaderboard). Runtime behavior is unchanged (already dynamic). Restoring a
// real 1h cache would need a cached aggregate (RPC + unstable_cache) — separate
// follow-up.
export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'D3 Creator — We don’t sell dreams. We show numbers.',
  description:
    'D3 Creator is a live showcase of the creators, brands, and IPs we grow across every platform. Real traffic. Real engagement. Real growth.',
  alternates: { canonical: '/' },
};

// Organization schema for rich results / knowledge panel.
const organizationJsonLd = {
  '@context': 'https://schema.org',
  '@type': 'Organization',
  name: SITE_NAME,
  url: SITE_URL,
  logo: `${SITE_URL}/d3-logo.png`,
};

const PLATFORM_ORDER: PlatformKey[] = [
  'facebook',
  'instagram',
  'tiktok',
  'douyin',
  // xiaohongshu (RedNote) archived — hidden from the platform strip.
];

const ETHOS = [
  {
    eyebrow: 'Why this exists',
    title: 'Numbers, not narratives.',
    body: 'Every creator we have built shows up here with their live counts, not a cherry-picked deck.',
  },
  {
    eyebrow: 'What you will see',
    title: 'Followers, views, engagement.',
    body: 'Across every platform we operate, snapshotted daily. No edited screenshots, no rounded-up claims.',
  },
  {
    eyebrow: 'Who is behind it',
    title: 'A creator-growth studio from Malaysia.',
    body: 'Operating since 2021. Founders, operators and creators building commercial IP that lasts.',
  },
];

/**
 * Public landing page. The hero carries the proof itself — the live totals
 * panel is the same data the dashboard renders, not a decorative graphic — then
 * manifesto, ethos, a top-creators preview, platform coverage and a closing CTA.
 * Falls back to synthetic demo rows when there is no live data yet.
 */
export default async function HomePage() {
  // One fetch → derive the summary, top creators, and platform breakdown. When
  // there is no live data yet, the synthetic demo rows flow through the SAME
  // helpers, so the page always shows combined totals (followers + views),
  // never 30-day deltas.
  const liveRows = await getLiveCreatorRows().catch((err) => {
    console.error('[home] getLiveCreatorRows failed', err);
    return null;
  });
  const isLive = !!(liveRows && liveRows.length > 0);
  const rows = isLive ? liveRows! : demoCreatorRows();

  const summary = summarizeCreatorRows(rows);
  // Top 5 by views — matches the views-first ranking on the dashboard and
  // leaderboard so the public showcase is consistent end to end.
  const topCreators = [...rows]
    .sort((a, b) => b.totalViews - a.totalViews)
    .slice(0, 5)
    .map((r, i) => ({ ...r, rank: i + 1 }));
  const combinedEngagement = rows.reduce((s, c) => s + c.totalEngagement, 0);

  // Per-platform cards: each platform that has a profile shows its combined
  // totals; platforms with none render "Not yet tracked".
  const liveByPlatform = new Map<PlatformKey, LivePlatformBreakdown>();
  for (const p of platformBreakdownFromRows(rows))
    liveByPlatform.set(p.platform, p);

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(organizationJsonLd),
        }}
      />

      {/* ----- HERO — the headline and the evidence for it, side by side ----- */}
      <Section space="lg">
        <Container>
          <div className="grid grid-cols-1 items-center gap-12 lg:grid-cols-[1.05fr_1fr] lg:gap-16">
            <div>
              {/* The badge only claims "live" when the numbers actually are. */}
              {isLive ? (
                <LiveBadge>Live showcase</LiveBadge>
              ) : (
                <Badge tone="muted">Showcase preview</Badge>
              )}
              <h1 className="mt-6 text-display-1 text-fg text-balance">
                We don’t sell dreams. We show numbers.
              </h1>
              <p className="mt-6 max-w-[46ch] text-body-lg text-fg-muted">
                A live showcase of the creators, brands and IPs we grow. Every
                figure on this site is scraped from the platforms themselves and
                refreshed daily — including the bad days.
              </p>
              <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                <ButtonLink href="/dashboard" size="lg">
                  Open the dashboard
                </ButtonLink>
                <ButtonLink href="/leaderboard" variant="secondary" size="lg">
                  See the leaderboard
                </ButtonLink>
              </div>
            </div>

            {/* The proof panel. Same numbers as /dashboard, no decoration. */}
            <Card padding="lg" className="lg:justify-self-end lg:w-full">
              <div className="flex items-baseline justify-between gap-4">
                <p className="text-micro uppercase text-fg-subtle">
                  Total views
                </p>
                <Link
                  href="/dashboard"
                  className="text-caption text-fg-muted transition-colors duration-150 ease-out hover:text-fg"
                >
                  Break it down
                </Link>
              </div>
              <p className="tnum mt-3 text-metric-lg text-fg">
                {formatShowcase(summary.combinedViews)}
              </p>
              <p className="mt-2 text-caption text-fg-subtle">
                All platforms · across every tracked post
              </p>

              <dl className="mt-6 grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-line-subtle bg-line-subtle">
                <div className="bg-surface p-4">
                  <dt className="text-micro uppercase text-fg-subtle">
                    Followers
                  </dt>
                  <dd className="tnum mt-2 text-heading text-fg">
                    {formatShowcase(summary.combinedFollowers)}
                  </dd>
                  <dd className="mt-1 text-caption text-fg-subtle">
                    Latest scraped count
                  </dd>
                </div>
                <div className="bg-surface p-4">
                  <dt className="text-micro uppercase text-fg-subtle">
                    Engagement
                  </dt>
                  <dd className="tnum mt-2 text-heading text-fg">
                    {formatShowcase(combinedEngagement)}
                  </dd>
                  <dd className="mt-1 text-caption text-fg-subtle">
                    All tracked posts
                  </dd>
                </div>
              </dl>

              <p className="mt-4 text-caption text-fg-subtle">
                <span className="tnum">
                  {exactFormatter.format(summary.trackedCreators)}
                </span>{' '}
                creators tracked across{' '}
                <span className="tnum">{PLATFORM_ORDER.length}</span> platforms.
              </p>
            </Card>
          </div>

          {!isLive && (
            <Alert tone="info" title="Showcase preview" className="mt-10">
              These are synthetic figures. Live numbers replace them the moment
              the scraper switches on.
            </Alert>
          )}
        </Container>
      </Section>

      {/* ----- MANIFESTO ----- */}
      <Section divided>
        <Container>
          <Reveal>
            <h2 className="sr-only">Manifesto</h2>
            <p className="text-body-lg text-fg-subtle">
              <span className="mr-3 line-through decoration-fg-subtle">
                No screenshots.
              </span>
              <span className="mr-3 line-through decoration-fg-subtle">
                No fake case studies.
              </span>
              <span className="text-fg">Just live numbers.</span>
            </p>
            <blockquote className="mt-6 max-w-prose text-display-2 text-fg">
              Real growth, published the same way it happens — daily, in public,
              without editing.
            </blockquote>
          </Reveal>
        </Container>
      </Section>

      {/* ----- ETHOS ----- */}
      <Section divided>
        <Container>
          <Reveal>
            <SectionHeader title="Why the numbers are public" />
            <div className="grid grid-cols-1 gap-px overflow-hidden rounded-2xl border border-line bg-line md:grid-cols-3">
              {ETHOS.map((item) => (
                <div key={item.eyebrow} className="bg-surface p-6 sm:p-8">
                  <p className="text-micro uppercase text-fg-subtle">
                    {item.eyebrow}
                  </p>
                  <h3 className="mt-3 text-subsection text-fg">{item.title}</h3>
                  <p className="mt-3 text-body text-fg-muted">{item.body}</p>
                </div>
              ))}
            </div>
          </Reveal>
        </Container>
      </Section>

      {/* ----- LIVE PREVIEW ----- */}
      <Section divided>
        <Container>
          <Reveal>
            <SectionHeader
              eyebrow="Live preview"
              title="The five biggest right now"
              lede="Ranked by total views across every tracked post, on every platform we run."
              action={
                <Link
                  href="/leaderboard"
                  className="text-label text-fg-muted transition-colors duration-150 ease-out hover:text-fg"
                >
                  Full leaderboard →
                </Link>
              }
            />

            <TableWrap>
              <Table>
                <caption className="sr-only">
                  Top five creators by total views across all platforms
                </caption>
                <thead>
                  <tr>
                    <Th className="w-14">
                      <span className="sr-only">Rank</span>
                      <span aria-hidden="true">#</span>
                    </Th>
                    <Th className="w-full">Creator</Th>
                    <Th numeric>Views</Th>
                    <Th numeric className="hidden sm:table-cell">
                      Followers
                    </Th>
                  </tr>
                </thead>
                <tbody>
                  {topCreators.map((creator) => {
                    const initial =
                      creator.displayName.trim().charAt(0).toUpperCase() || '?';
                    const slug = creator.primaryHandle
                      ? handleToSlug(creator.primaryHandle)
                      : null;
                    return (
                      <Tr key={creator.creatorId}>
                        <Td>
                          <Rank n={creator.rank} />
                        </Td>
                        {/* w-full + max-w-0: the name truncates rather than
                            pushing Views past the wrapper's edge on a phone. */}
                        <Td className="w-full max-w-0">
                          <span className="flex min-w-0 items-center gap-3">
                            <span className="grid size-7 shrink-0 place-items-center overflow-hidden rounded-full border border-line bg-surface-subtle text-caption text-fg-muted">
                              <ImageWithFallback
                                src={creator.avatarUrl}
                                alt=""
                                className="size-full object-cover"
                                fallback={initial}
                              />
                            </span>
                            {slug ? (
                              <Link
                                href={`/creators/${slug}`}
                                className="truncate text-body text-fg underline-offset-4 hover:underline"
                              >
                                {creator.displayName}
                              </Link>
                            ) : (
                              <span className="truncate text-body text-fg">
                                {creator.displayName}
                              </span>
                            )}
                          </span>
                        </Td>
                        <Td numeric>
                          <ShowcaseNumber value={creator.totalViews} />
                        </Td>
                        <Td numeric className="hidden sm:table-cell">
                          <span className="text-fg-muted">
                            <ShowcaseNumber value={creator.followers} />
                          </span>
                        </Td>
                      </Tr>
                    );
                  })}
                </tbody>
              </Table>
            </TableWrap>
          </Reveal>
        </Container>
      </Section>

      {/* ----- PLATFORM COVERAGE ----- */}
      <Section divided>
        <Container>
          <Reveal>
            <SectionHeader
              eyebrow="Coverage"
              title="Four platforms, one set of numbers"
              lede="Views are summed across every tracked post on that platform; followers are the latest count we scraped."
            />

            <div className="grid grid-cols-1 gap-px overflow-hidden rounded-2xl border border-line bg-line sm:grid-cols-2 lg:grid-cols-4">
              {PLATFORM_ORDER.map((platform) => {
                const Icon = PLATFORM_ICONS[platform];
                const live = liveByPlatform.get(platform);
                const creatorCount = live?.creatorCount ?? 0;
                return (
                  <Link
                    key={platform}
                    href="/dashboard"
                    className="group bg-surface p-6 transition-colors duration-150 ease-out hover:bg-surface-subtle focus-visible:bg-surface-subtle"
                  >
                    <span className="flex items-center justify-between">
                      <span className="inline-flex size-9 items-center justify-center rounded-lg border border-line bg-surface-subtle text-fg">
                        <Icon size={16} />
                      </span>
                      <span className="tnum text-caption text-fg-subtle">
                        {live
                          ? `${creatorCount} creator${creatorCount === 1 ? '' : 's'}`
                          : 'Not yet tracked'}
                      </span>
                    </span>
                    <span className="mt-5 block text-label text-fg">
                      {PLATFORM_LABELS[platform]}
                    </span>
                    <span className="tnum mt-1 block text-metric text-fg">
                      {live ? formatShowcase(live.totalViews) : '—'}
                    </span>
                    <span className="mt-1 block text-caption text-fg-subtle">
                      views · all tracked posts
                    </span>
                    <span className="mt-4 flex items-center justify-between border-t border-line-subtle pt-3 text-caption text-fg-muted">
                      <span className="tnum">
                        {live ? formatShowcase(live.followers) : '—'}
                      </span>
                      <span className="text-fg-subtle">followers</span>
                    </span>
                  </Link>
                );
              })}
            </div>
          </Reveal>
        </Container>
      </Section>

      {/* ----- CLOSING ----- */}
      <Section divided space="lg">
        <Container>
          <Reveal>
            <div className="mx-auto max-w-prose text-center">
              <h2 className="text-section text-fg">Watch the numbers move</h2>
              <p className="mt-4 text-body-lg text-fg-muted">
                The dashboard updates as our scraper collects. Filter by
                platform, pick a window, and read the same figures we do.
              </p>
              <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
                <ButtonLink href="/dashboard" variant="secondary" size="lg">
                  Open the dashboard
                </ButtonLink>
                <ButtonLink href="/about" variant="ghost" size="lg">
                  How we work
                </ButtonLink>
              </div>
            </div>
          </Reveal>
        </Container>
      </Section>
    </>
  );
}
