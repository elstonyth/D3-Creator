import { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import {
  Container,
  Section,
  SectionHeader,
} from '@gitroom/frontend/components/ui/section';
import { Stat, StatRow } from '@gitroom/frontend/components/ui/stat';
import { EmptyState } from '@gitroom/frontend/components/ui/empty-state';
import { PlatformPill } from '@gitroom/frontend/components/ui/platform-pill';
import {
  type PlatformKey,
  PLATFORM_LABELS,
} from '@gitroom/frontend/components/ui/platform-icons';
import { ContentGrid } from '@gitroom/frontend/components/creator-showcase/content-grid';
import {
  formatPostDateLong,
  type ContentPost,
} from '@gitroom/frontend/components/creator-showcase/content-data';
import {
  getCreatorPlatformDetail,
  type PlatformPostRow,
} from '@gitroom/frontend/lib/queries';

// ISR: 1h cache, see (public)/page.tsx for rationale.
export const revalidate = 3600;

type Params = { id: string; platform: string };

const VALID: PlatformKey[] = [
  'facebook',
  'instagram',
  'tiktok',
  'douyin',
  // xiaohongshu (RedNote) archived - its per-platform route now 404s (notFound).
];

const compact = new Intl.NumberFormat('en-US', {
  notation: 'compact',
  maximumFractionDigits: 1,
});

export async function generateMetadata({
  params,
}: {
  params: Promise<Params>;
}): Promise<Metadata> {
  const { id, platform } = await params;
  const key = platform.toLowerCase() as PlatformKey;
  const label = PLATFORM_LABELS[key] ?? platform;
  return {
    title: `${id} on ${label} — D3 Creator`,
    description: `Live ${label} stats for ${id} — followers, engagement, and recent posts.`,
    alternates: { canonical: `/creators/${id}/${platform}` },
    openGraph: {
      title: `${id} on ${label} — D3 Creator`,
      description: `Live ${label} stats for ${id} — followers, engagement, and recent posts.`,
    },
  };
}

export default async function CreatorPlatformPage({
  params,
}: {
  params: Promise<Params>;
}) {
  const { id, platform } = await params;
  const platformKey = platform.toLowerCase() as PlatformKey;
  if (!VALID.includes(platformKey)) notFound();

  const detail = await getCreatorPlatformDetail(id, platformKey).catch(
    (err) => {
      console.error(
        '[creators/[id]/[platform]] getCreatorPlatformDetail failed',
        err,
      );
      return null;
    },
  );
  if (!detail) notFound();
  const { creator, slot, posts } = detail;
  const label = PLATFORM_LABELS[platformKey];

  // Newest first. Rows arrive ordered by capture batch, so posts from two
  // different captures can interleave without this.
  const livePosts: ContentPost[] = posts
    .map(
      (p: PlatformPostRow): ContentPost => ({
        id: `${creator.creatorId}-${platformKey}-${p.externalId}`,
        creatorSlug: id.toLowerCase(),
        platform: platformKey,
        externalId: p.externalId,
        url: p.url,
        type: p.type === 'note' || p.type === 'text' ? 'image' : p.type,
        thumbnailUrl: p.thumbnailUrl,
        caption: p.caption,
        hashtags: p.hashtags,
        publishedAt: p.publishedAt,
        metrics: {
          likes: p.likes,
          comments: p.comments,
          shares: p.shares,
          views: p.views,
          saves: null,
        },
        mediaCount: p.mediaCount,
        durationSec: p.durationSec,
      }),
    )
    .sort((a, b) => Date.parse(b.publishedAt) - Date.parse(a.publishedAt));

  const capturedAt = slot?.capturedAt ? formatPostDateLong(slot.capturedAt) : null;

  return (
    <Container>
      <Section space="md">
        <Link
          href={`/creators/${encodeURIComponent(id)}`}
          className="-ml-2 mb-6 inline-flex h-10 items-center gap-1.5 rounded-lg px-2 text-caption text-fg-muted transition-colors duration-150 ease-out hover:text-fg focus-visible:outline-none focus-visible:shadow-focus"
        >
          <span aria-hidden="true">&larr;</span> {creator.displayName}
        </Link>

        <div className="mb-5 flex flex-wrap items-center gap-3">
          <PlatformPill platform={platformKey} />
          {slot?.handle ? (
            <span className="text-body-sm text-fg-muted">@{slot.handle}</span>
          ) : null}
        </div>

        <h1 className="text-display-2 text-fg [overflow-wrap:anywhere]">
          {creator.displayName} on {label}
        </h1>
        {slot?.nickname ? (
          <p className="mt-3 max-w-prose text-body text-fg-muted">
            {slot.nickname}
          </p>
        ) : null}
        {capturedAt ? (
          <p className="mt-4 text-caption text-fg-subtle">
            Last captured {capturedAt}
          </p>
        ) : null}
      </Section>

      {slot ? (
        <Section space="md" divided>
          <SectionHeader
            title="Reach"
            lede={`Followers are from the latest capture of this ${label} profile. Views and likes cover the 30 most recent posts only, so they read lower than the all-time totals on the leaderboard.`}
          />
          <StatRow>
            <Stat
              label="Followers"
              size="lg"
              value={slot.followers != null ? compact.format(slot.followers) : '—'}
              meta={`On ${label}`}
            />
            <Stat
              label="Total views"
              size="lg"
              value={
                slot.totalViews != null ? compact.format(slot.totalViews) : '—'
              }
              meta={
                slot.totalViews != null
                  ? 'Last 30 posts'
                  : 'This platform reports no view counts'
              }
            />
            <Stat
              label="Total likes"
              size="lg"
              value={
                slot.totalLikes != null ? compact.format(slot.totalLikes) : '—'
              }
              meta={
                slot.totalLikes != null
                  ? 'Last 30 posts'
                  : 'No likes captured yet'
              }
            />
          </StatRow>
        </Section>
      ) : null}

      <Section space="md" divided className="pb-20 sm:pb-28">
        <SectionHeader
          title="Recent posts"
          lede={
            livePosts.length === 1
              ? 'The one post we have captured so far. Open it for the full caption and counts.'
              : livePosts.length > 1
                ? `The ${livePosts.length} most recent posts we have captured. Open one for its full caption and counts.`
                : undefined
          }
        />

        {livePosts.length > 0 ? (
          <ContentGrid posts={livePosts} />
        ) : slot ? (
          <EmptyState
            title="No posts captured yet"
            description={`This ${label} profile is tracked, but the daily scrape has not returned any posts for it yet. It fills in after the next run.`}
            action={{
              href: `/creators/${encodeURIComponent(id)}`,
              label: `Back to ${creator.displayName}`,
            }}
          />
        ) : (
          <EmptyState
            title={`Not tracked on ${label}`}
            description={`${creator.displayName} has no ${label} profile connected, so there are no numbers to show here.`}
            action={{
              href: `/creators/${encodeURIComponent(id)}`,
              label: 'See tracked platforms',
            }}
          />
        )}
      </Section>
    </Container>
  );
}
