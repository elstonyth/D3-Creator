/**
 * /admin/profiles — agency account review, grouped by creator.
 *
 * The agency thinks in *accounts* (creators), not raw URLs. Each creator is a
 * group: account-level aggregates (reach, daily Δ, views, engagement, health)
 * with their platform profiles nested underneath in a dense table. A global
 * pending-claims queue sits at the top for sign-off.
 *
 * No edit-URL action here: a URL change goes through delete + re-add, because
 * the URL is what makes a profile canonical (editing in place could collide
 * with the uniqueness invariant). The per-creator editor does allow it.
 */

import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import Link from 'next/link';

import { getSupabaseAdmin } from '@d3/database';
import { getAuthContext } from '@gitroom/frontend/lib/auth';
import { PlatformPill } from '@gitroom/frontend/components/ui/platform-pill';
import {
  PLATFORM_LABELS,
  type PlatformKey,
} from '@gitroom/frontend/components/ui/platform-icons';
import { Container, Section } from '@gitroom/frontend/components/ui/section';
import { Stat, StatRow } from '@gitroom/frontend/components/ui/stat';
import {
  Table,
  TableWrap,
  Td,
  Th,
  Tr,
} from '@gitroom/frontend/components/ui/table';
import { EmptyState } from '@gitroom/frontend/components/ui/empty-state';
import {
  getAdminCreatorsData,
  SNAPSHOT_WINDOW_DAYS,
  type AdminCreatorGroup,
  type AdminProfileRow,
} from '@gitroom/frontend/lib/admin-creators';
import {
  formatCompact,
  formatDelta,
  formatPercent,
} from '@gitroom/frontend/lib/creator-metrics';
import { formatDataAge } from '@gitroom/frontend/lib/scrape-staleness';

import { ClaimActions, DeleteProfileButton } from './admin-actions';
import { AdminSearchForm } from './admin-search';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export const metadata: Metadata = {
  title: 'Admin · Accounts — D3 Creator',
};

function toPlatformKey(platform: string): PlatformKey {
  return platform === 'rednote' ? 'xiaohongshu' : (platform as PlatformKey);
}

// Yellow-mono: direction reads from a caret glyph + text intensity, never hue.
function deltaClass(n: number | null): string {
  if (n == null || n === 0) return 'text-fg-subtle';
  return n > 0 ? 'text-fg' : 'text-fg-muted';
}

function deltaCaret(n: number | null): string {
  if (n == null || n === 0) return '— ';
  return n > 0 ? '▲ ' : '▼ ';
}

/**
 * Scrape status, as an operator reads it.
 *
 * The database value (`handle_changed`, `not_found`) is a slug; this is the
 * sentence. Every entry carries a glyph AND a word so the state survives
 * greyscale — the palette is yellow-mono and carries no meaning on its own
 * (DESIGN.md §2). `note` is the consequence, which is the part that actually
 * changes what the operator does next.
 */
type StatusGlyph = 'check' | 'clock' | 'pause' | 'x';
/**
 * Tone is how loud the pill is, and loudness means "an operator has to do
 * something", NOT "how bad the state sounds". `ok` is the quietest thing on
 * the page precisely because it is the most common and needs nothing; a
 * profile that has been failing for ten weeks is the loudest. Hue never moves
 * (DESIGN.md §2) — the glyph and the word carry the state.
 */
type StatusTone = 'quiet' | 'notice' | 'attention';

interface StatusMeta {
  label: string;
  glyph: StatusGlyph;
  tone: StatusTone;
  note: string;
  /** Broken states get the age of the failure appended where we have it. */
  broken?: boolean;
}

const STATUS_META: Record<string, StatusMeta> = {
  ok: {
    label: 'OK',
    glyph: 'check',
    tone: 'quiet',
    note: 'Scraped daily.',
  },
  pending: {
    label: 'Pending',
    glyph: 'clock',
    tone: 'notice',
    note: 'Queued — first scrape has not run yet.',
  },
  throttled: {
    label: 'Throttled',
    glyph: 'clock',
    tone: 'notice',
    note: 'Rate-limited upstream. Retries on the next run.',
  },
  handle_changed: {
    label: 'Handle changed',
    glyph: 'clock',
    tone: 'attention',
    note: 'Repoint the URL in the creator editor, or history stops here.',
  },
  private: {
    label: 'Private',
    glyph: 'pause',
    tone: 'quiet',
    note: 'Retired — the cron skips it, but its last numbers still show publicly.',
  },
  failed: {
    label: 'Failed',
    glyph: 'x',
    tone: 'attention',
    note: 'Scrape errored. Retried daily.',
    broken: true,
  },
  not_found: {
    label: 'Not found',
    glyph: 'x',
    tone: 'attention',
    note: 'The platform returns nothing for this URL.',
    broken: true,
  },
};

const UNKNOWN_STATUS: StatusMeta = {
  label: 'Unknown',
  glyph: 'clock',
  tone: 'notice',
  note: 'Unrecognised scrape status.',
};

function statusMeta(status: string): StatusMeta {
  return STATUS_META[status] ?? { ...UNKNOWN_STATUS, label: status };
}

// Intensity, not hue. Yellow is scarce (DESIGN.md §1) and "OK" is the most
// common state on this page — tinting it brand paints forty pills yellow and
// drowns the one action that actually wants the eye. The glyph and the word
// carry the state; brightness carries "needs attention".
const STATUS_TONE: Record<StatusTone, string> = {
  quiet: 'border-line bg-white/[0.03] text-fg-subtle',
  notice: 'border-line-strong bg-white/[0.04] text-fg-muted',
  attention: 'border-line-strong bg-white/[0.07] text-fg',
};

function StatusGlyphIcon({ glyph }: { glyph: StatusGlyph }) {
  const common = {
    width: 11,
    height: 11,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 2.2,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    'aria-hidden': true,
    className: 'shrink-0',
  };
  if (glyph === 'check')
    return (
      <svg {...common}>
        <path d="M20 6L9 17l-5-5" />
      </svg>
    );
  if (glyph === 'x')
    return (
      <svg {...common}>
        <path d="M18 6L6 18M6 6l12 12" />
      </svg>
    );
  if (glyph === 'pause')
    return (
      <svg {...common}>
        <path d="M9 5v14M15 5v14" />
      </svg>
    );
  return (
    <svg {...common}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </svg>
  );
}

function StatusPill({ status }: { status: string }) {
  const meta = statusMeta(status);
  return (
    <span
      title={meta.note}
      className={`inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border px-2 py-0.5 text-caption ${
        STATUS_TONE[meta.tone]
      }`}
    >
      <StatusGlyphIcon glyph={meta.glyph} />
      {meta.label}
    </span>
  );
}

// Allowlist for the ?platform= filter — mirrors the profile.platform CHECK set.
const FILTER_PLATFORMS = new Set([
  'instagram',
  'tiktok',
  'facebook',
  'rednote',
  'douyin',
]);

export default async function AdminProfilesPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; platform?: string }>;
}) {
  const auth = await getAuthContext();
  if (!auth) redirect('/login');
  if (auth.role !== 'admin') redirect('/me');

  const admin = getSupabaseAdmin();
  const { groups, pendingClaims, totals } = await getAdminCreatorsData(admin);

  // URL-as-state filtering — server-side on the already-fetched data, no new
  // query. ?q= matches creator name or any profile handle; ?platform= narrows
  // to accounts running that platform.
  const { q: rawQ = '', platform: rawPlatform = '' } = await searchParams;
  // Normalize ONCE (trim + 80-char cap) and reuse for display + links; the
  // lowercased copy is only for case-insensitive filtering.
  const normalizedQuery = rawQ.trim().slice(0, 80);
  const query = normalizedQuery.toLowerCase();
  const platform = FILTER_PLATFORMS.has(rawPlatform) ? rawPlatform : '';
  const platforms = Array.from(
    new Set(groups.flatMap((g) => g.platforms))
  ).sort();
  const filteredGroups = groups.filter((g) => {
    const matchesPlatform = !platform || g.platforms.includes(platform);
    const matchesQuery =
      !query ||
      g.displayName.toLowerCase().includes(query) ||
      g.profiles.some(
        (p) =>
          (p.handle ?? '').toLowerCase().includes(query) ||
          (p.displayName ?? '').toLowerCase().includes(query)
      );
    return matchesPlatform && matchesQuery;
  });
  const chipHref = (p: string) => {
    const params = new URLSearchParams();
    if (normalizedQuery) params.set('q', normalizedQuery);
    if (p) params.set('platform', p);
    const qs = params.toString();
    return qs ? `/admin/profiles?${qs}` : '/admin/profiles';
  };
  const filtered = filteredGroups.length !== groups.length;
  const staleAccounts = groups.filter((g) => g.staleProfileCount > 0).length;

  return (
    <Container>
      <Section space="sm" className="space-y-10">
        <header className="max-w-prose">
          <p className="text-micro uppercase text-fg-subtle">Accounts</p>
          <h1 className="mt-3 text-display-2 text-fg">Scrape health</h1>
          <p className="mt-3 text-body-lg text-fg-muted">
            One card per creator, their platform profiles underneath. A profile
            is a single canonical scrape target — several users can claim the
            same one without duplicating the job.
          </p>
        </header>

        <StatRow className="lg:grid-cols-4">
          <Stat
            label="Creators"
            value={formatCompact(totals.creators)}
            meta={
              staleAccounts > 0
                ? `${staleAccounts} with stale data`
                : 'All data fresh'
            }
          />
          <Stat
            label="Profiles"
            value={formatCompact(totals.profiles)}
            meta="Scrape targets"
          />
          <Stat
            label="Total reach"
            value={formatCompact(totals.reach)}
            meta="Followers, latest snapshot"
          />
          <Stat
            label="Total views"
            value={formatCompact(totals.views)}
            meta="All tracked posts"
          />
        </StatRow>

        {pendingClaims.length > 0 && (
          <section aria-labelledby="claims-heading" className="space-y-4">
            <div className="max-w-prose">
              <h2 id="claims-heading" className="text-section text-fg">
                Pending claims{' '}
                <span className="tnum">({pendingClaims.length})</span>
              </h2>
              <p className="mt-2 text-body text-fg-muted">
                A user claimed a profile whose handle did not auto-match.
                Approving makes them its owner; rejecting leaves the profile
                unclaimed.
              </p>
            </div>
            <ul className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-surface">
              {pendingClaims.map((c) => (
                <li
                  key={`${c.userId}-${c.profileId}`}
                  className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between sm:gap-4"
                >
                  <div className="min-w-0">
                    <p className="truncate text-body text-fg">
                      {c.handle ?? c.profileUrl}
                    </p>
                    <p className="mt-1 text-caption text-fg-muted">
                      {c.platform} · {c.creatorName}
                    </p>
                    <p className="mt-0.5 truncate font-mono text-caption text-fg-subtle">
                      User {c.userId}
                    </p>
                  </div>
                  <ClaimActions
                    userId={c.userId}
                    profileId={c.profileId}
                    alreadyOwned={c.alreadyOwned}
                    target={c.handle ?? c.profileUrl}
                  />
                </li>
              ))}
            </ul>
          </section>
        )}

        <section aria-labelledby="accounts-heading" className="space-y-5">
          <div className="max-w-prose">
            <h2 id="accounts-heading" className="text-section text-fg">
              All accounts
            </h2>
            <p className="mt-2 text-body text-fg-muted">
              Showing{' '}
              <span className="tnum text-fg">{filteredGroups.length}</span>
              {filtered ? (
                <>
                  {' '}
                  of <span className="tnum">{groups.length}</span>
                </>
              ) : null}{' '}
              {groups.length === 1 ? 'account' : 'accounts'}. Data age is the
              time since the last successful capture, not the last attempt.
            </p>
          </div>

          {/* Filter toolbar — URL-as-state via a soft-navigating form + chips */}
          <div className="space-y-3">
            <AdminSearchForm
              defaultQuery={normalizedQuery}
              platform={platform}
            />
            {platforms.length > 0 && (
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-caption text-fg-subtle">Platform</span>
                <FilterChip href={chipHref('')} active={!platform}>
                  All
                </FilterChip>
                {platforms.map((p) => (
                  <FilterChip
                    key={p}
                    href={chipHref(p)}
                    active={platform === p}
                  >
                    {PLATFORM_LABELS[toPlatformKey(p)] ?? p}
                  </FilterChip>
                ))}
              </div>
            )}
          </div>

          {groups.length === 0 ? (
            <EmptyState
              title="No creators yet"
              description="Provision the first creator from the overview — it creates the login and attaches their social URLs in one step."
              action={{ href: '/admin', label: 'Provision a creator' }}
            />
          ) : filteredGroups.length === 0 ? (
            <EmptyState
              size="sm"
              title="Nothing matches those filters"
              description={
                normalizedQuery
                  ? `No account name or handle contains “${normalizedQuery}”.`
                  : 'No account runs that platform.'
              }
              // Neutral, not the yellow CTA: the pending-claims queue above
              // may already own the one primary action on this screen.
              secondary={{ href: '/admin/profiles', label: 'Clear filters' }}
            />
          ) : (
            <div className="space-y-5">
              {filteredGroups.map((g) => (
                <CreatorCard key={g.creatorId} group={g} />
              ))}
            </div>
          )}
        </section>
      </Section>
    </Container>
  );
}

function FilterChip({
  href,
  active,
  children,
}: {
  href: string;
  active: boolean;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      scroll={false}
      aria-current={active ? 'true' : undefined}
      className={`rounded-full border px-3 py-1 text-caption transition-colors duration-150 ease-out focus-visible:outline-none focus-visible:shadow-focus ${
        active
          ? 'border-brand/30 bg-brand/10 text-fg'
          : 'border-line bg-white/[0.03] text-fg-muted hover:border-line-strong hover:text-fg'
      }`}
    >
      {children}
    </Link>
  );
}

function CreatorCard({ group }: { group: AdminCreatorGroup }) {
  const initial = group.displayName.trim().charAt(0).toUpperCase() || '?';
  return (
    <article className="overflow-hidden rounded-2xl border border-line bg-surface">
      <div className="flex flex-wrap items-start gap-4 border-b border-line p-5">
        <span className="flex size-11 shrink-0 items-center justify-center overflow-hidden rounded-full border border-line bg-surface-subtle">
          {group.avatarUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- external avatar, dims vary
            <img
              src={group.avatarUrl}
              alt=""
              className="size-full object-cover"
            />
          ) : (
            <span aria-hidden className="text-heading text-fg-subtle">
              {initial}
            </span>
          )}
        </span>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="min-w-0 text-heading text-fg">
              <Link
                href={`/admin/creators/${group.creatorId}`}
                className="underline-offset-4 transition-colors duration-150 ease-out hover:underline focus-visible:outline-none focus-visible:shadow-focus"
              >
                {group.displayName}
              </Link>
            </h3>
            <StatusPill status={group.status} />
            {group.clientName && (
              <span className="rounded-full border border-line px-2 py-0.5 text-caption text-fg-subtle">
                {group.clientName}
              </span>
            )}
          </div>
          <p className="mt-1.5 text-caption text-fg-subtle">
            <span className="tnum">{group.profileCount}</span>{' '}
            {group.profileCount === 1 ? 'profile' : 'profiles'}
            {group.staleProfileCount > 0 && (
              // Brighter than the metadata around it: this is the one thing on
              // a card header that means "open me". Intensity, not hue.
              <>
                {' · '}
                <span className="tnum text-fg">
                  {group.staleProfileCount} stale
                </span>
              </>
            )}
          </p>
        </div>

        <dl className="flex w-full shrink-0 justify-between gap-4 sm:w-auto sm:justify-end sm:gap-6">
          <Agg
            label="Reach"
            value={formatCompact(group.totalReach)}
            sub={`${deltaCaret(group.reachDelta)}${formatDelta(
              group.reachDelta
            )} today`}
            subClass={deltaClass(group.reachDelta)}
          />
          <Agg
            label="Views"
            value={formatCompact(group.totalViews)}
            sub="all posts"
          />
          <Agg
            label="Engagement"
            value={formatPercent(group.engagement)}
            sub="tracked posts"
          />
        </dl>
      </div>

      {group.profiles.length === 0 ? (
        <p className="p-5 text-body-sm text-fg-muted">
          No platform profiles on this account yet.{' '}
          <Link
            href={`/admin/creators/${group.creatorId}`}
            className="text-fg underline underline-offset-4 focus-visible:outline-none focus-visible:shadow-focus"
          >
            Add a URL
          </Link>
          .
        </p>
      ) : (
        <TableWrap className="rounded-none border-0 bg-transparent">
          <Table className="min-w-[860px]">
            <caption className="sr-only">
              Platform profiles for {group.displayName}
            </caption>
            <thead>
              <tr>
                <Th className="w-24">Platform</Th>
                <Th>Profile</Th>
                <Th className="w-40">Status</Th>
                <Th className="w-28">Data age</Th>
                <Th numeric className="w-32">
                  Followers
                </Th>
                <Th className="w-32">Claims</Th>
                <Th className="w-32 text-right">
                  <span className="sr-only">Actions</span>
                </Th>
              </tr>
            </thead>
            <tbody>
              {group.profiles.map((p) => (
                <ProfileRow key={p.id} p={p} />
              ))}
            </tbody>
          </Table>
        </TableWrap>
      )}
    </article>
  );
}

function ProfileRow({ p }: { p: AdminProfileRow }) {
  const meta = statusMeta(p.scrapeStatus);
  const key = toPlatformKey(p.platform);
  const name = p.displayName ?? p.handle ?? p.profileUrl;

  return (
    <Tr>
      <Td>
        <PlatformPill platform={key} iconSize={12} className="!px-2 !py-1">
          {/* Icon-only for density; the glyph is aria-hidden, so the platform
              name has to come from here or the cell is silent to a reader. */}
          <span className="sr-only">{PLATFORM_LABELS[key]}</span>
        </PlatformPill>
      </Td>
      <Td>
        <div className="min-w-0 max-w-[280px]">
          <p className="truncate text-fg">{name}</p>
          <a
            href={p.profileUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="block truncate text-caption text-fg-subtle underline-offset-4 transition-colors duration-150 ease-out hover:text-fg-muted hover:underline focus-visible:outline-none focus-visible:shadow-focus"
          >
            {p.profileUrl}
          </a>
        </div>
      </Td>
      <Td>
        <StatusPill status={p.scrapeStatus} />
        {p.scrapeStatus !== 'ok' && (
          <p className="mt-1 max-w-[220px] text-caption text-fg-subtle">
            {meta.note}
          </p>
        )}
      </Td>
      <Td>
        <DataAge
          hours={p.dataAgeHours}
          stale={p.isStale}
          broken={meta.broken}
        />
      </Td>
      <Td numeric>
        <span className="text-fg">{formatCompact(p.followers)}</span>
        <span
          className={`mt-0.5 block text-caption ${deltaClass(
            p.followersDelta
          )}`}
        >
          {deltaCaret(p.followersDelta)}
          {formatDelta(p.followersDelta)} today
        </span>
      </Td>
      <Td>
        <p className="tnum text-caption text-fg-muted">
          {p.ownerCount} owner · {p.trackerCount} tracker
        </p>
        {p.pendingCount > 0 && (
          <p className="tnum mt-1 inline-flex rounded-full border border-brand/25 bg-brand/10 px-2 py-0.5 text-caption text-fg">
            {p.pendingCount} pending
          </p>
        )}
      </Td>
      <Td className="text-right">
        <DeleteProfileButton
          profileId={p.id}
          target={`${PLATFORM_LABELS[key]} · ${p.handle ?? name}`}
        />
      </Td>
    </Tr>
  );
}

function Agg({
  label,
  value,
  sub,
  subClass,
}: {
  label: string;
  value: string;
  sub: string;
  subClass?: string;
}) {
  return (
    <div className="text-right">
      <dt className="text-micro uppercase text-fg-subtle">{label}</dt>
      <dd className="tnum mt-1 text-body text-fg">{value}</dd>
      <dd className={`tnum text-caption ${subClass ?? 'text-fg-subtle'}`}>
        {sub}
      </dd>
    </div>
  );
}

/**
 * Age of the profile's DATA.
 *
 * Without this, a `failed` badge looks identical whether the profile broke an
 * hour ago or ten weeks ago — which is how one sat 70 days stale unnoticed.
 *
 * Yellow-mono per DESIGN.md §2 — intensity, never a foreign hue. Note the
 * direction: STALE is the BRIGHTER of the two (`text-fg`) and fresh is dimmer
 * (`text-fg-subtle`). Intensity tracks "needs attention", not "severity of
 * state" — rendering the rotting profile fainter than the healthy one would
 * bury exactly what this exists to surface.
 */
function DataAge({
  hours,
  stale,
  broken,
}: {
  hours?: number | null;
  stale?: boolean;
  broken?: boolean;
}) {
  // `undefined` means the builder never evaluated staleness (getAdminCreatorDetail
  // fetches no snapshots) — distinct from `null`, which means "evaluated, and
  // found no capture in the window", the worst case. Render nothing rather than
  // an age we did not measure. `null` still renders, and renders as 'no data'.
  if (hours === undefined)
    return <span className="text-caption text-fg-subtle">Not measured</span>;

  const age = formatDataAge(hours);
  return (
    <div>
      <p
        className={`tnum text-body-sm ${stale ? 'text-fg' : 'text-fg-subtle'}`}
        title={
          hours === null
            ? `No successful capture in the last ${SNAPSHOT_WINDOW_DAYS} days`
            : `Last successful capture ${age} ago`
        }
      >
        {hours === null ? 'No data' : age}
      </p>
      {broken && hours !== null && (
        <p className="text-caption text-fg-subtle">failing {age}</p>
      )}
    </div>
  );
}
