/**
 * Top 30 creators by 30-day follower growth. Server-rendered dense table.
 * No engagement column (private-only). Delta reads from a caret glyph plus
 * text intensity — yellow-mono, never a foreign hue (DESIGN.md §2). Rows
 * without a full window show "Building history…" instead of a fake zero.
 */
import Link from 'next/link';

import type { CreatorMetricWindowRow } from '@gitroom/frontend/lib/metrics-windowed';
import {
  formatCompact,
  formatDelta,
} from '@gitroom/frontend/lib/creator-metrics';
import { BUILDING_HISTORY } from '@gitroom/frontend/lib/format-metric';
import { PlatformPill } from '@gitroom/frontend/components/ui/platform-pill';
import {
  PLATFORM_LABELS,
  type PlatformKey,
} from '@gitroom/frontend/components/ui/platform-icons';
import {
  Table,
  TableWrap,
  Td,
  Th,
  Tr,
  Rank,
} from '@gitroom/frontend/components/ui/table';

function toPlatformKey(platform: string | null): PlatformKey | null {
  if (!platform) return null;
  return platform === 'rednote' ? 'xiaohongshu' : (platform as PlatformKey);
}
function deltaClass(n: number): string {
  if (n === 0) return 'text-fg-subtle';
  return n > 0 ? 'text-fg' : 'text-fg-muted';
}
function deltaCaret(n: number): string {
  if (n === 0) return '—\u00a0';
  return n > 0 ? '▲\u00a0' : '▼\u00a0';
}

export function Top30Creators({ rows }: { rows: CreatorMetricWindowRow[] }) {
  return (
    <section
      aria-labelledby="top-creators-heading"
      className="overflow-hidden rounded-2xl border border-line bg-surface"
    >
      <div className="border-b border-line px-5 py-4">
        <h3 id="top-creators-heading" className="text-heading text-fg">
          Top creators
        </h3>
        <p className="mt-1 text-caption text-fg-subtle">
          Follower growth · last 30 days
        </p>
      </div>

      {rows.length === 0 ? (
        <p className="px-5 py-8 text-body text-fg-muted">
          No creator has a full 30 days of history yet. Ranking appears once the
          daily snapshots span the window.
        </p>
      ) : (
        <TableWrap className="rounded-none border-0 bg-transparent">
          <Table className="min-w-[460px]">
            <thead>
              <tr>
                <Th className="w-12">#</Th>
                <Th>Creator</Th>
                <Th className="w-20">Platform</Th>
                <Th numeric>Followers</Th>
                <Th numeric>Δ 30d</Th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, i) => (
                <CreatorRow key={row.creatorId} row={row} rank={i + 1} />
              ))}
            </tbody>
          </Table>
        </TableWrap>
      )}
    </section>
  );
}

function CreatorRow({
  row,
  rank,
}: {
  row: CreatorMetricWindowRow;
  rank: number;
}) {
  const pk = toPlatformKey(row.primaryPlatform);
  const name = row.displayName ?? 'Unnamed creator';
  const initial = name.trim().charAt(0).toUpperCase() || '?';

  return (
    <Tr>
      <Td>
        <Rank n={rank} />
      </Td>
      <Td>
        <div className="flex min-w-0 items-center gap-2.5">
          <span className="flex size-7 shrink-0 items-center justify-center overflow-hidden rounded-full border border-line bg-surface-subtle">
            {row.avatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element -- external avatar, dims vary
              <img
                src={row.avatarUrl}
                alt=""
                className="size-full object-cover"
              />
            ) : (
              <span aria-hidden className="text-caption text-fg-subtle">
                {initial}
              </span>
            )}
          </span>
          {row.primaryHandle ? (
            <Link
              href={`/creators/${row.primaryHandle}`}
              className="truncate text-fg underline-offset-4 transition-colors duration-150 ease-out hover:underline focus-visible:outline-none focus-visible:shadow-focus"
            >
              {name}
            </Link>
          ) : (
            <span className="truncate text-fg">{name}</span>
          )}
        </div>
      </Td>
      <Td>
        {pk ? (
          <PlatformPill platform={pk} iconSize={12} className="!px-2 !py-1">
            {/* Icon-only for density; the glyph is aria-hidden, so the name
                has to come from here or the cell is silent to a screen reader. */}
            <span className="sr-only">{PLATFORM_LABELS[pk]}</span>
          </PlatformPill>
        ) : (
          <span className="text-caption text-fg-subtle">Not set</span>
        )}
      </Td>
      <Td numeric>{formatCompact(row.followers)}</Td>
      <Td numeric className="text-caption">
        {row.insufficient ? (
          <span className="text-fg-subtle">{BUILDING_HISTORY}</span>
        ) : (
          <span className={deltaClass(row.followersDelta)}>
            {deltaCaret(row.followersDelta)}
            {formatDelta(row.followersDelta)}
          </span>
        )}
      </Td>
    </Tr>
  );
}
