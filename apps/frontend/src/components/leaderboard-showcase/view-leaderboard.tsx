'use client';

import Image from 'next/image';
import clsx from 'clsx';
import { GlassCard } from '../ui/glass-card';
import { EmptyState } from '../ui/empty-state';
import { PLATFORM_ICONS, type PlatformKey } from '../ui/platform-icons';
import { compactFormatter } from '../dashboard-showcase/showcase-data';
import { buildPostUrl, postInteractions } from '../../lib/queries';
import type { TopContentRow } from '../../lib/metrics-windowed';

function toPlatformKey(platform: string): PlatformKey {
  return platform === 'rednote' ? 'xiaohongshu' : (platform as PlatformKey);
}

export interface ViewLeaderboardProps {
  rows: TopContentRow[];
  title?: string;
  subtitle?: string;
  /** Which metric to surface on each card. */
  metric?: 'views' | 'interactions';
}

export function ViewLeaderboard({
  rows,
  title = 'Top Content',
  subtitle = 'Top posts by views',
  metric = 'views',
}: ViewLeaderboardProps) {
  return (
    <GlassCard variant="base" padding="md" radius="2xl" className="flex flex-col">
      <div className="flex flex-col gap-1 mb-5">
        <span className="text-label text-fg font-medium">{title}</span>
        <span className="text-body-sm text-fgMuted">{subtitle}</span>
      </div>

      {rows.length === 0 ? (
        <EmptyState size="sm" title="No content ranked yet — building history…" />
      ) : (
        <ul className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-3">
          {rows.map((row, i) => (
            <ContentCard
              key={`${row.externalPostId}-${i}`}
              row={row}
              rank={i + 1}
              metric={metric}
            />
          ))}
        </ul>
      )}
    </GlassCard>
  );
}

function ContentCard({
  row,
  rank,
  metric,
}: {
  row: TopContentRow;
  rank: number;
  metric: 'views' | 'interactions';
}) {
  const platformKey = toPlatformKey(row.platform);
  const Icon = PLATFORM_ICONS[platformKey];
  const isWinner = rank === 1;
  const href = buildPostUrl(platformKey, {}, row.externalPostId, row.handle);
  const value =
    metric === 'views' ? row.currentViews : postInteractions(row);
  const unit = metric === 'views' ? 'views' : 'interactions';

  return (
    <li>
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className="group block relative aspect-[9/16] rounded-xl overflow-hidden bg-customColor1 border border-borderGlass hover:border-borderGlassStrong transition-colors outline-none focus-visible:ring-1 focus-visible:ring-brand-500"
      >
        {row.thumbnailUrl ? (
          <Image
            src={row.thumbnailUrl}
            alt={row.captionExcerpt ?? 'Post thumbnail'}
            fill
            sizes="(max-width: 640px) 50vw, (max-width: 1280px) 25vw, 16vw"
            unoptimized
            className="absolute inset-0 size-full object-cover"
          />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center text-fgSubtle">
            <Icon size={28} />
          </div>
        )}

        <span
          className={clsx(
            'absolute top-2 left-2 size-7 rounded-full flex items-center justify-center text-caption font-mono tabular-nums',
            isWinner ? 'bg-brand-500 text-brand-darker font-semibold' : 'bg-black/60 text-fg',
          )}
        >
          {String(rank).padStart(2, '0')}
        </span>
        <span className="absolute top-2 right-2 size-7 rounded-full bg-black/60 flex items-center justify-center text-fg">
          <Icon size={13} />
        </span>

        <div className="absolute inset-x-0 bottom-0 p-3 bg-gradient-to-t from-black/85 via-black/45 to-transparent">
          <div className="text-fg font-mono tabular-nums text-heading leading-tight">
            {compactFormatter.format(value)}
          </div>
          <div className="text-caption text-fgMuted">{unit}</div>
          <div className="text-caption text-fgSubtle truncate mt-0.5">
            {row.creatorName ?? row.handle ?? ''}
          </div>
        </div>
      </a>
    </li>
  );
}
