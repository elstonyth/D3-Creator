import { type Locale } from '@gitroom/frontend/lib/i18n';

import { getI18n } from '@gitroom/frontend/lib/i18n-server';
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

const compact = (locale: Locale) =>
  new Intl.NumberFormat(locale === 'zh' ? 'zh-CN' : 'en-US', {
    notation: 'compact',
    maximumFractionDigits: 1,
  });

export async function generateMetadata({
  params,
}: {
  params: Promise<Params>;
}): Promise<Metadata> {
  const { t } = await getI18n();
  const { id, platform } = await params;
  const key = platform.toLowerCase() as PlatformKey;
  const label = t(PLATFORM_LABELS[key] ?? platform);
  return {
    title: t('{name} on {platform} — D3 Creator', {
      name: id,
      platform: label,
    }),
    description: t(
      'Live {platform} stats for {name} — followers, engagement, and recent posts.',
      { platform: label, name: id }
    ),
    alternates: { canonical: `/creators/${id}/${platform}` },
    openGraph: {
      title: t('{name} on {platform} — D3 Creator', {
        name: id,
        platform: label,
      }),
      description: t(
        'Live {platform} stats for {name} — followers, engagement, and recent posts.',
        { platform: label, name: id }
      ),
    },
  };
}

export default async function CreatorPlatformPage({
  params,
}: {
  params: Promise<Params>;
}) {
  const { locale, t } = await getI18n();
  const { id, platform } = await params;
  const platformKey = platform.toLowerCase() as PlatformKey;
  if (!VALID.includes(platformKey)) notFound();

  const detail = await getCreatorPlatformDetail(id, platformKey).catch(
    (err) => {
      console.error(
        '[creators/[id]/[platform]] getCreatorPlatformDetail failed',
        err
      );
      return null;
    }
  );
  if (!detail) notFound();
  const { creator, slot, posts } = detail;
  const label = t(PLATFORM_LABELS[platformKey]);

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
      })
    )
    .sort((a, b) => Date.parse(b.publishedAt) - Date.parse(a.publishedAt));

  const capturedAt = slot?.capturedAt
    ? formatPostDateLong(slot.capturedAt, locale)
    : null;

  return (
    <Container>
      <Section space="md">
        <Link
          href={`/creators/${encodeURIComponent(id)}`}
          className="-ml-2 mb-6 inline-flex h-10 items-center gap-1.5 rounded-lg px-2 text-caption text-fg-muted transition-colors duration-150 ease-out hover:text-fg focus-visible:outline-none focus-visible:shadow-focus"
        >
          <span aria-hidden="true">{'←'}</span> {creator.displayName}
        </Link>

        <div className="mb-5 flex flex-wrap items-center gap-3">
          <PlatformPill platform={platformKey} />
          {slot?.handle ? (
            <span className="text-body-sm text-fg-muted">@{slot.handle}</span>
          ) : null}
        </div>

        <h1 className="text-display-2 text-fg [overflow-wrap:anywhere]">
          {t('{name} on {platform}', {
            name: creator.displayName,
            platform: label,
          })}
        </h1>
        {slot?.nickname ? (
          <p className="mt-3 max-w-prose text-body text-fg-muted">
            {slot.nickname}
          </p>
        ) : null}
        {capturedAt ? (
          <p className="mt-4 text-caption text-fg-subtle">
            {t('Last captured {date}', { date: capturedAt })}
          </p>
        ) : null}
      </Section>

      {slot ? (
        <Section space="md" divided>
          <SectionHeader
            title={t('Reach')}
            lede={t(
              'Followers are from the latest capture of this {platform} profile. Views and likes cover the 30 most recent posts only, so they read lower than the all-time totals on the leaderboard.',
              { platform: label }
            )}
          />
          <StatRow>
            <Stat
              label={t('Followers')}
              size="lg"
              value={
                slot.followers != null
                  ? compact(locale).format(slot.followers)
                  : '—'
              }
              meta={t('On {platform}', { platform: label })}
            />
            <Stat
              label={t('Total views')}
              size="lg"
              value={
                slot.totalViews != null
                  ? compact(locale).format(slot.totalViews)
                  : '—'
              }
              meta={
                slot.totalViews != null
                  ? t('Last 30 posts')
                  : t('This platform reports no view counts')
              }
            />
            <Stat
              label={t('Total likes')}
              size="lg"
              value={
                slot.totalLikes != null
                  ? compact(locale).format(slot.totalLikes)
                  : '—'
              }
              meta={
                slot.totalLikes != null
                  ? t('Last 30 posts')
                  : t('No likes captured yet')
              }
            />
          </StatRow>
        </Section>
      ) : null}

      <Section space="md" divided className="pb-20 sm:pb-28">
        <SectionHeader
          title={t('Recent posts')}
          lede={
            livePosts.length === 1
              ? t(
                  'The one post we have captured so far. Open it for the full caption and counts.'
                )
              : livePosts.length > 1
              ? t(
                  'The {count} most recent posts we have captured. Open one for its full caption and counts.',
                  { count: livePosts.length }
                )
              : undefined
          }
        />

        {livePosts.length > 0 ? (
          <ContentGrid posts={livePosts} />
        ) : slot ? (
          <EmptyState
            title={t('No posts captured yet')}
            description={t(
              'This {platform} profile is tracked, but the daily scrape has not returned any posts for it yet. It fills in after the next run.',
              { platform: label }
            )}
            action={{
              href: `/creators/${encodeURIComponent(id)}`,
              label: t('Back to {name}', { name: creator.displayName }),
            }}
          />
        ) : (
          <EmptyState
            title={t('Not tracked on {platform}', { platform: label })}
            description={t(
              '{name} has no {platform} profile connected, so there are no numbers to show here.',
              { name: creator.displayName, platform: label }
            )}
            action={{
              href: `/creators/${encodeURIComponent(id)}`,
              label: t('See tracked platforms'),
            }}
          />
        )}
      </Section>
    </Container>
  );
}
