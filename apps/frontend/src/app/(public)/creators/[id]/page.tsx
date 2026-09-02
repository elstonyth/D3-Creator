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
import { ImageWithFallback } from '@gitroom/frontend/components/ui/image-with-fallback';
import {
  PLATFORM_ICONS,
  PLATFORM_LABELS,
  type PlatformKey,
} from '@gitroom/frontend/components/ui/platform-icons';
import {
  getCreatorByHandle,
  type CreatorPlatformSlot,
} from '@gitroom/frontend/lib/queries';

// ISR: 1h cache, see (public)/page.tsx for rationale.
export const revalidate = 3600;

type Params = { id: string };

const SUPPORTED: PlatformKey[] = [
  'facebook',
  'instagram',
  'tiktok',
  'douyin',
  // xiaohongshu (RedNote) archived - hidden from the per-creator platform list.
];

const compact = new Intl.NumberFormat('en-US', {
  notation: 'compact',
  maximumFractionDigits: 1,
});
const exact = new Intl.NumberFormat('en-US');

export async function generateMetadata({
  params,
}: {
  params: Promise<Params>;
}): Promise<Metadata> {
  const { id } = await params;
  const creator = await getCreatorByHandle(id).catch(() => null);
  const name = creator?.displayName ?? id;
  return {
    title: `${name} — D3 Creator`,
    description: `Live follower counts, engagement, and growth for ${name} across every platform.`,
    alternates: { canonical: `/creators/${id}` },
    openGraph: {
      title: `${name} — D3 Creator`,
      description: `Live follower counts, engagement, and growth for ${name} across every platform.`,
    },
  };
}

export default async function CreatorPage({
  params,
}: {
  params: Promise<Params>;
}) {
  const { id } = await params;
  const creator = await getCreatorByHandle(id).catch((err) => {
    console.error('[creators/[id]] getCreatorByHandle failed', err);
    return null;
  });

  if (!creator) {
    notFound();
  }

  let totalLikes = 0;
  let totalViews = 0;
  // A sum of `?? 0` cannot tell a genuine zero from a platform that reports
  // nothing, and printing "— no counts captured" over a real 0 is a lie on a
  // page whose whole promise is unedited numbers. Ask the slots instead.
  let hasViews = false;
  let hasLikes = false;
  for (const p of creator.platforms as CreatorPlatformSlot[]) {
    totalLikes += p.totalLikes ?? 0;
    totalViews += p.totalViews ?? 0;
    if (p.totalViews != null) hasViews = true;
    if (p.totalLikes != null) hasLikes = true;
  }

  const slots = creator.platforms as CreatorPlatformSlot[];
  const bySupported = SUPPORTED.map((key) => ({
    key,
    slot: slots.find((p) => p.platform === key) ?? null,
  }));
  // Tracked platforms first: an inert "not tracked" row sitting between two
  // live ones reads as a hole in the data rather than a platform this creator
  // is simply not on.
  const rows = [
    ...bySupported.filter((r) => r.slot),
    ...bySupported.filter((r) => !r.slot),
  ];
  const tracked = bySupported.filter((r) => r.slot);
  const primaryHandle = slots.find((p) => p.handle)?.handle ?? null;
  const platformCount = slots.length;

  return (
    <Container>
      <Section space="md">
        <Link
          href="/creators"
          className="-ml-2 mb-6 inline-flex h-10 items-center gap-1.5 rounded-lg px-2 text-caption text-fg-muted transition-colors duration-150 ease-out hover:text-fg focus-visible:outline-none focus-visible:shadow-focus"
        >
          <span aria-hidden="true">&larr;</span> All creators
        </Link>

        <div className="flex flex-col gap-6 sm:flex-row sm:items-start sm:gap-7">
          <div className="flex size-20 shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-line bg-surface-subtle text-subsection font-semibold text-fg-muted">
            <ImageWithFallback
              src={creator.avatarUrl}
              alt=""
              loading="eager"
              className="h-full w-full object-cover"
              fallback={creator.displayName.charAt(0).toUpperCase()}
            />
          </div>

          <div className="min-w-0">
            <h1 className="text-display-2 text-fg [overflow-wrap:anywhere]">
              {creator.displayName}
            </h1>
            {primaryHandle ? (
              <p className="mt-2 text-body text-fg-muted">@{primaryHandle}</p>
            ) : null}
            {creator.biography ? (
              <p className="mt-4 max-w-prose whitespace-pre-line break-words text-body text-fg-muted">
                {creator.biography}
              </p>
            ) : null}

            {tracked.length > 0 ? (
              <ul className="mt-6 flex flex-wrap gap-2">
                {tracked.map(({ key }) => {
                  const Icon = PLATFORM_ICONS[key];
                  return (
                    <li key={key}>
                      <Link
                        href={`/creators/${encodeURIComponent(id)}/${key}`}
                        className="inline-flex h-10 items-center gap-2 rounded-full border border-line bg-surface px-4 text-label text-fg transition-colors duration-150 ease-out hover:border-line-strong hover:bg-white/[0.04] focus-visible:outline-none focus-visible:shadow-focus"
                      >
                        <Icon size={14} className="shrink-0" />
                        {PLATFORM_LABELS[key]}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            ) : null}
          </div>
        </div>
      </Section>

      <Section space="md" divided>
        <SectionHeader
          title="Reach"
          lede="Followers come from the latest daily capture. Views and likes are summed over the 30 most recent posts on each platform, which is why they read lower than the all-time totals on the leaderboard."
        />
        <StatRow>
          <Stat
            label="Total followers"
            size="lg"
            value={compact.format(creator.totalFollowers)}
            meta={
              <>
                <span className="tnum">
                  {exact.format(creator.totalFollowers)}
                </span>{' '}
                across {platformCount} platform
                {platformCount === 1 ? '' : 's'}
              </>
            }
          />
          <Stat
            label="Total views"
            size="lg"
            value={hasViews ? compact.format(totalViews) : '—'}
            meta={
              hasViews
                ? 'Last 30 posts per platform'
                : 'No view counts captured yet'
            }
          />
          <Stat
            label="Total likes"
            size="lg"
            value={hasLikes ? compact.format(totalLikes) : '—'}
            meta={
              hasLikes
                ? 'Last 30 posts per platform'
                : 'No like counts captured yet'
            }
          />
        </StatRow>
      </Section>

      <Section space="md" divided className="pb-20 sm:pb-28">
        <SectionHeader
          title="Platforms"
          lede="Open a platform for its followers and the posts behind these numbers."
        />

        {tracked.length === 0 ? (
          <EmptyState
            title="No platforms tracked yet"
            description="This creator is on the roster but has no profile connected, so there is nothing to scrape yet."
            action={{ href: '/creators', label: 'Browse other creators' }}
          />
        ) : (
          <ul className="divide-y divide-line-subtle overflow-hidden rounded-2xl border border-line bg-surface">
            {rows.map(({ key, slot }) => (
              <li key={key}>
                <PlatformRow creatorId={id} platform={key} slot={slot} />
              </li>
            ))}
          </ul>
        )}
      </Section>
    </Container>
  );
}

/**
 * One platform in the breakdown list. A tracked platform is a link to its
 * detail view; an untracked one is inert, dimmed, and says so in words rather
 * than by being an empty box.
 */
function PlatformRow({
  creatorId,
  platform,
  slot,
}: {
  creatorId: string;
  platform: PlatformKey;
  slot: CreatorPlatformSlot | null;
}) {
  const Icon = PLATFORM_ICONS[platform];
  const label = PLATFORM_LABELS[platform];

  if (!slot) {
    return (
      <div className="flex items-center gap-4 px-4 py-4 sm:px-5">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-lg border border-line-subtle bg-surface-subtle text-fg-subtle">
          <Icon size={16} />
        </span>
        <span className="min-w-0 flex-1 text-label text-fg-muted">{label}</span>
        <span className="shrink-0 text-caption text-fg-subtle">Not tracked</span>
      </div>
    );
  }

  const followers = slot.followers;

  return (
    <Link
      href={`/creators/${encodeURIComponent(creatorId)}/${platform}`}
      className="group flex items-center gap-4 px-4 py-4 transition-colors duration-150 ease-out hover:bg-white/[0.03] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand sm:px-5"
    >
      <span className="flex size-9 shrink-0 items-center justify-center rounded-lg border border-line bg-surface-subtle text-fg">
        <Icon size={16} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-label text-fg">{label}</span>
        <span className="block truncate text-caption text-fg-subtle">
          {slot.handle ? `@${slot.handle}` : 'Handle not recorded'}
        </span>
      </span>
      <span className="shrink-0 text-right">
        <span className="tnum block text-body text-fg">
          {followers != null ? compact.format(followers) : '—'}
        </span>
        <span className="block text-caption text-fg-subtle">
          {followers != null ? 'followers' : 'syncing'}
        </span>
      </span>
      <svg
        viewBox="0 0 16 16"
        aria-hidden="true"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="h-4 w-4 shrink-0 text-fg-subtle transition-colors duration-150 ease-out group-hover:text-fg"
      >
        <path d="m6 3.5 5 4.5-5 4.5" />
      </svg>
    </Link>
  );
}
