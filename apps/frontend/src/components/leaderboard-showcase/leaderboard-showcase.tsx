'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import clsx from 'clsx';
import { GlassCard } from '../ui/glass-card';
import { PLATFORM_ICONS, PLATFORM_LABELS } from '../ui/platform-icons';
import {
  compactFormatter,
  exactFormatter,
  handleToSlug,
  demoCreatorRows,
  type PlatformFilter,
} from '../dashboard-showcase/showcase-data';
import type { LiveCreatorRow } from '@gitroom/frontend/lib/queries';
import type { TopContentRow } from '@gitroom/frontend/lib/metrics-windowed';
import { ViewLeaderboard } from './view-leaderboard';

interface TabDef {
  value: PlatformFilter;
  label: string;
}

const TABS: TabDef[] = [
  { value: 'all', label: 'All Platforms' },
  { value: 'instagram', label: PLATFORM_LABELS.instagram },
  { value: 'tiktok', label: PLATFORM_LABELS.tiktok },
  { value: 'douyin', label: PLATFORM_LABELS.douyin },
  { value: 'facebook', label: PLATFORM_LABELS.facebook },
  // xiaohongshu archived — hidden from the platform filter.
];

function filterLabel(filter: PlatformFilter): string {
  return filter === 'all' ? 'All platforms' : PLATFORM_LABELS[filter];
}

/** A creator resolved for the active platform filter (combined totals). */
interface LbRow {
  key: string;
  name: string;
  slug: string | null;
  followers: number;
  totalViews: number;
  totalEngagement: number;
}

function resolveRows(creators: LiveCreatorRow[], filter: PlatformFilter): LbRow[] {
  const rows: LbRow[] =
    filter === 'all'
      ? creators.map((c) => ({
          key: c.creatorId,
          name: c.displayName,
          slug: c.primaryHandle ? handleToSlug(c.primaryHandle) : null,
          followers: c.followers,
          totalViews: c.totalViews,
          totalEngagement: c.totalEngagement,
        }))
      : creators.flatMap((c) => {
          const slot = c.platforms.find((p) => p.platform === filter);
          if (!slot) return [];
          return [
            {
              key: c.creatorId,
              name: c.displayName,
              slug: slot.handle ? handleToSlug(slot.handle) : null,
              followers: slot.followers,
              totalViews: slot.totalViews,
              totalEngagement: slot.totalEngagement,
            },
          ];
        });
  // Top-followers ranking.
  return rows.sort((a, b) => b.followers - a.followers);
}

export interface LeaderboardShowcaseProps {
  liveCreators?: LiveCreatorRow[] | null;
  topByViews?: TopContentRow[] | null;
  topByInteractions?: TopContentRow[] | null;
}

export function LeaderboardShowcase({
  liveCreators,
  topByViews,
  topByInteractions,
}: LeaderboardShowcaseProps = {}) {
  const [filter, setFilter] = useState<PlatformFilter>('all');
  const isLive = !!(liveCreators && liveCreators.length > 0);
  const baseCreators = useMemo(
    () => (isLive ? liveCreators! : demoCreatorRows()),
    [isLive, liveCreators],
  );

  const rows = useMemo(() => resolveRows(baseCreators, filter), [baseCreators, filter]);

  const stats = useMemo(() => {
    let followers = 0;
    let views = 0;
    let engagement = 0;
    for (const r of rows) {
      followers += r.followers;
      views += r.totalViews;
      engagement += r.totalEngagement;
    }
    return { creators: rows.length, followers, views, engagement };
  }, [rows]);

  return (
    <div className="flex flex-col gap-5">
      <PlatformTabBar value={filter} onChange={setFilter} />

      {/* Summary — compact tiles, readable labels */}
      <div className="grid grid-cols-3 gap-3 sm:gap-4">
        <SummaryStat
          label="Total Followers"
          value={compactFormatter.format(stats.followers)}
          note={`${exactFormatter.format(stats.creators)} creator${stats.creators === 1 ? '' : 's'}`}
        />
        <SummaryStat
          label="Total Views"
          value={exactFormatter.format(stats.views)}
          note="across recent posts"
        />
        <SummaryStat
          label="Total Engagement"
          value={compactFormatter.format(stats.engagement)}
          note="likes, comments & shares"
        />
      </div>

      {/* Ranking 1 — Top creators by followers */}
      <RankSection title="Top Creators" subtitle={`${filterLabel(filter)} · by followers`}>
        {rows.length === 0 ? (
          <EmptyRow label="No creators on this platform yet." />
        ) : (
          <CreatorTable rows={rows} />
        )}
      </RankSection>

      {/* Ranking 2 — Top content by views */}
      <ViewLeaderboard
        rows={topByViews ?? []}
        title="Top Content"
        subtitle="Most-viewed posts"
        metric="views"
      />

      {/* Ranking 3 — Top content by interactions */}
      <ViewLeaderboard
        rows={topByInteractions ?? []}
        title="Top Engaging Content"
        subtitle="Most likes, comments & shares"
        metric="interactions"
      />

      {!isLive && (
        <p className="text-caption text-fgSubtle text-center pt-2 tabular-nums">
          Showcase preview · synthetic data. Live numbers replace this the moment the scraper switches on.
        </p>
      )}
    </div>
  );
}

// --- Tab bar --------------------------------------------------------------

interface PlatformTabBarProps {
  value: PlatformFilter;
  onChange: (next: PlatformFilter) => void;
}

function PlatformTabBar({ value, onChange }: PlatformTabBarProps) {
  return (
    <div
      role="tablist"
      aria-label="Platform filter"
      className="border border-borderGlass rounded-2xl bg-customColor1 p-1.5 flex items-center gap-1 overflow-x-auto"
    >
      {TABS.map((tab) => {
        const isActive = tab.value === value;
        const Icon = tab.value === 'all' ? null : PLATFORM_ICONS[tab.value];
        return (
          <button
            key={tab.value}
            type="button"
            role="tab"
            aria-selected={isActive}
            onClick={() => onChange(tab.value)}
            className={clsx(
              'inline-flex items-center gap-2 h-9 px-3.5 rounded-xl text-label whitespace-nowrap',
              'transition-colors duration-150 ease-out',
              isActive
                ? 'bg-customColor16 text-fg border border-borderGlassStrong'
                : 'border border-transparent text-fgMuted hover:text-fg hover:bg-white/[0.04]'
            )}
          >
            {Icon ? <Icon size={14} /> : null}
            <span>{tab.label}</span>
          </button>
        );
      })}
    </div>
  );
}

// --- Summary stat (compact metric tile) -----------------------------------

function SummaryStat({ label, value, note }: { label: string; value: string; note: string }) {
  return (
    <GlassCard variant="base" padding="md" radius="2xl" className="flex flex-col gap-1.5">
      <span className="text-label text-fgMuted">{label}</span>
      <div className="text-[clamp(22px,2.4vw,30px)] leading-[1.05] tracking-[-0.02em] font-semibold text-fg tabular-nums">
        {value}
      </div>
      <p className="text-caption text-fgSubtle tabular-nums">{note}</p>
    </GlassCard>
  );
}

// --- Ranking section wrapper ----------------------------------------------

function RankSection({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle: string;
  children: React.ReactNode;
}) {
  return (
    <GlassCard variant="base" padding="md" radius="2xl" className="flex flex-col">
      <div className="flex flex-col gap-1 mb-4">
        <span className="text-label text-fg font-medium">{title}</span>
        <span className="text-body-sm text-fgMuted">{subtitle}</span>
      </div>
      {children}
    </GlassCard>
  );
}

function EmptyRow({ label }: { label: string }) {
  return <div className="grid place-items-center text-body-sm text-fgMuted py-12">{label}</div>;
}

// --- Creator table (rank · avatar+name · followers · views) ---------------

const GRID = 'grid grid-cols-[32px_minmax(0,1fr)_104px_104px] gap-3 items-center';

function CreatorTable({ rows }: { rows: LbRow[] }) {
  return (
    <div className="flex flex-col">
      <div
        aria-hidden
        className={`${GRID} px-2 pb-2 text-micro uppercase tracking-[0.04em] text-fgSubtle border-b border-borderGlass`}
      >
        <span>#</span>
        <span>Creator</span>
        <span className="text-right">Followers</span>
        <span className="text-right">Views</span>
      </div>
      <ul>
        {rows.map((row, i) => (
          <CreatorRow key={row.key} row={row} rank={i + 1} />
        ))}
      </ul>
    </div>
  );
}

function CreatorRow({ row, rank }: { row: LbRow; rank: number }) {
  const isWinner = rank === 1;
  const initial = row.name.trim().charAt(0).toUpperCase() || '?';
  const cells = (
    <>
      <span
        className={clsx(
          'font-mono tabular-nums text-body-sm',
          isWinner ? 'text-brand font-semibold' : 'text-fgSubtle',
        )}
      >
        {String(rank).padStart(2, '0')}
      </span>
      <span className="flex items-center gap-3 min-w-0">
        <span className="size-8 shrink-0 rounded-full bg-customColor1 border border-borderGlass grid place-items-center text-caption text-fgMuted">
          {initial}
        </span>
        <span className="truncate text-body text-fg font-medium">{row.name}</span>
      </span>
      <span className="text-right font-mono tabular-nums text-body text-fg">
        {compactFormatter.format(row.followers)}
      </span>
      <span className="text-right font-mono tabular-nums text-body-sm text-fgMuted">
        {compactFormatter.format(row.totalViews)}
      </span>
    </>
  );
  const rowClass = clsx(
    GRID,
    'px-2 h-14 rounded-lg transition-colors duration-150 ease-out border-b border-borderGlass last:border-b-0',
    isWinner && 'bg-brand/[0.06]',
  );
  return (
    <li>
      {row.slug ? (
        <Link
          href={`/creators/${row.slug}`}
          aria-label={`View ${row.name} profile`}
          className={`${rowClass} hover:bg-white/[0.03] focus-visible:bg-white/[0.05] outline-none`}
        >
          {cells}
        </Link>
      ) : (
        <div className={rowClass}>{cells}</div>
      )}
    </li>
  );
}
