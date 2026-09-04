import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getAuthContext } from '@gitroom/frontend/lib/auth';
import { getSupabaseRoute } from '@gitroom/frontend/lib/supabase-route';
import { resolveCreatorProfiles } from '@gitroom/frontend/lib/creator-metrics';
import {
  getTopContentWindowed,
  type TopContentRow,
} from '@gitroom/frontend/lib/metrics-windowed';
import { EmptyState } from '@gitroom/frontend/components/ui/empty-state';
import { Badge } from '@gitroom/frontend/components/ui/badge';
import { Container, Section } from '@gitroom/frontend/components/ui/section';
import {
  PLATFORM_ICONS,
  PLATFORM_LABELS,
  type PlatformKey,
} from '@gitroom/frontend/components/ui/platform-icons';
import { ImageWithFallback } from '@gitroom/frontend/components/ui/image-with-fallback';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export const metadata: Metadata = {
  title: 'My leaderboard — D3 Creator',
};

// Module scope: one formatter for the whole list, and a fixed locale so the
// server-rendered date can never disagree with the client's.
const dateFmt = new Intl.DateTimeFormat('en-GB', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
});
const numberFmt = new Intl.NumberFormat('en-US');

export default async function CreatorMeLeaderboardPage() {
  const auth = await getAuthContext();
  if (!auth) redirect('/login');
  if (auth.role === 'admin') redirect('/admin');
  // No onboarding gate — creators see their top posts straight away.

  // Cookie-aware client — same defense-in-depth reasoning as /me/page.tsx.
  // The data tables have "public read for anon + authenticated" RLS for the
  // showcase, so this client sees the same rows an anon visitor would, and
  // the profile filter narrows to this user's own posts at the query level.
  // If the filter ever broke, the leak is bounded by what's already public
  // via /leaderboard.
  const sb = await getSupabaseRoute();

  // Which profiles count as "this user's"? Source of truth is profile_claim
  // (owner + tracker), shared with /me — NOT profile.creator_id. A tracked
  // profile belonging to another creator still surfaces this user's view of
  // its top posts.
  const { profiles } = await resolveCreatorProfiles(sb, {
    userId: auth.userId,
    creatorId: auth.creatorLink?.creator_id ?? null,
  });
  const ids = profiles.map((p) => p.id);

  // Top posts across those profiles, by views. Uses the shared windowed RPC —
  // the same source as the public leaderboard and the /me dashboard's Top
  // content — so each post appears once (deduped to its latest snapshot) rather
  // than once per daily snapshot, which the old raw post_snapshot query did.
  // 'lifetime' ranks by absolute views (with no baseline, views_gained ==
  // current_views, so the order is highest-viewed first).
  let posts: TopContentRow[] = [];
  if (ids.length) {
    posts = await getTopContentWindowed('lifetime', {
      client: sb,
      profileIds: ids,
      limit: 20,
    });
  }

  return (
    <Container className="pb-16">
      {/* Header and list share one Section so the page keeps a single vertical
          rhythm; a bare wrapper div between two Sections adds nothing. */}
      <Section space="sm" className="flex flex-col gap-10 sm:gap-12">
        <header className="max-w-prose">
          <Badge tone="muted" className="mb-5 uppercase tracking-[0.08em]">
            All time
          </Badge>
          <h1 className="text-display-2 text-fg">Your top posts.</h1>
          <p className="mt-4 text-body-lg text-fg-muted">
            Your highest-viewed posts across every platform we track, ranked by
            total views since the post went up.
          </p>
        </header>

        <div>
          {posts.length === 0 ? (
            <EmptyState
              icon={
                <svg
                  width="26"
                  height="26"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.75"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden
                >
                  <path d="M4 21V9M10 21V4M16 21v-7M22 21H2" />
                </svg>
              }
              title="No posts to rank yet"
              description={
                ids.length === 0
                  ? 'Your agency manages the accounts we track. Your top posts appear here once the first one is connected.'
                  : 'Your top posts appear here once the first daily scrape collects them — usually within 24 hours.'
              }
              action={{ href: '/me', label: 'See your numbers' }}
            />
          ) : (
            <>
              <p className="mb-4 text-caption text-fg-subtle">
                {posts.length === 1
                  ? '1 post · ranked by total views'
                  : `${posts.length} posts · ranked by total views`}
              </p>
              <ol className="divide-y divide-line-subtle overflow-hidden rounded-2xl border border-line bg-surface">
                {posts.map((p, i) => (
                  <PostRow
                    key={`${p.profileId}:${p.externalPostId}`}
                    row={p}
                    rank={i + 1}
                  />
                ))}
              </ol>
            </>
          )}
        </div>
      </Section>
    </Container>
  );
}

function PostRow({ row, rank }: { row: TopContentRow; rank: number }) {
  const leader = rank === 1;
  return (
    <li className="flex items-center gap-4 px-4 py-3.5 transition-colors duration-150 ease-out hover:bg-white/[0.025] sm:px-5">
      {/* Fixed-width rank so the thumbnails below it stay in one column. */}
      <span
        className={`tnum w-7 shrink-0 text-right text-body-sm ${
          leader ? 'font-medium text-brand' : 'text-fg-subtle'
        }`}
      >
        {String(rank).padStart(2, '0')}
      </span>

      <div className="relative size-14 shrink-0 overflow-hidden rounded-md border border-line-subtle bg-surface-subtle">
        <ImageWithFallback
          src={row.thumbnailUrl}
          alt=""
          loading="lazy"
          className="absolute inset-0 size-full object-cover"
          fallback={
            <div className="absolute inset-0 flex items-center justify-center text-caption text-fg-subtle">
              —
            </div>
          }
        />
      </div>

      <div className="min-w-0 flex-1">
        <p className="truncate text-body text-fg">
          {row.captionExcerpt ?? 'Untitled post'}
        </p>
        <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-caption text-fg-subtle">
          <span>
            {row.postedAt
              ? dateFmt.format(new Date(row.postedAt))
              : 'Date unknown'}
          </span>
          {row.alsoOn && row.alsoOn.length > 0 ? (
            <span className="flex items-center gap-1.5">
              <span aria-hidden>·</span>
              <span>also on</span>
              {/* The glyphs are aria-hidden, so name the platforms for a
                  screen reader rather than leaving "also on" dangling. */}
              <span className="sr-only">
                {row.alsoOn
                  .map((plat) => {
                    const k = (
                      plat === 'rednote' ? 'xiaohongshu' : plat
                    ) as PlatformKey;
                    return PLATFORM_LABELS[k] ?? plat;
                  })
                  .join(', ')}
              </span>
              {row.alsoOn.map((plat) => {
                const key = (
                  plat === 'rednote' ? 'xiaohongshu' : plat
                ) as PlatformKey;
                const AlsoIcon = PLATFORM_ICONS[key];
                return AlsoIcon ? <AlsoIcon key={plat} size={12} /> : null;
              })}
            </span>
          ) : null}
        </p>
      </div>

      <div className="flex shrink-0 items-center gap-4 sm:gap-6">
        <PostStat label="Views" value={row.currentViews} strong />
        <PostStat label="Likes" value={row.likes} />
        <PostStat label="Comments" value={row.comments} />
      </div>
    </li>
  );
}

function PostStat({
  label,
  value,
  strong = false,
}: {
  label: string;
  value: number | null;
  strong?: boolean;
}) {
  return (
    <div className={strong ? 'text-right' : 'hidden text-right sm:block'}>
      <div className={`tnum text-body ${strong ? 'text-fg' : 'text-fg-muted'}`}>
        {value != null ? numberFmt.format(value) : '—'}
      </div>
      <div className="text-micro uppercase text-fg-subtle">{label}</div>
    </div>
  );
}
