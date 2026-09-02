'use client';

import { useState } from 'react';
import Image from 'next/image';
import clsx from 'clsx';
import { Card } from '../ui/card';
import { EmptyState } from '../ui/empty-state';
import { Button } from '../ui/button';
import {
  PLATFORM_ICONS,
  PLATFORM_LABELS,
  type PlatformKey,
} from '../ui/platform-icons';
import { compactFormatter } from '../dashboard-showcase/showcase-data';
import { BUILDING_HISTORY } from '../../lib/format-metric';
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
  /**
   * Heading level for `title`. This block is dropped into three pages whose
   * outlines differ: on /me it is the first heading under the page h1 (2), on
   * the public leaderboard it sits inside a "Content" h2 section (3).
   */
  headingLevel?: 2 | 3;
}

const PAGE_SIZE = 12;

/**
 * Ranked grid of posts. Self-contained card: the leaderboard page, /admin and
 * /me all drop it straight into their own layout, so the heading and the
 * surface live in here rather than at each call site.
 */
export function ViewLeaderboard({
  rows,
  title = 'Top Content',
  subtitle = 'Top posts by views',
  metric = 'views',
  headingLevel = 2,
}: ViewLeaderboardProps) {
  const [page, setPage] = useState(0);
  const totalPages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  // Clamp in case `rows` shrank since the last render (keeps page in range).
  const current = Math.min(page, totalPages - 1);
  const start = current * PAGE_SIZE;
  const pageRows = rows.slice(start, start + PAGE_SIZE);

  return (
    <Card padding="md" className="flex flex-col">
      <div className="mb-5 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        {headingLevel === 3 ? (
          <h3 className="text-heading text-fg">{title}</h3>
        ) : (
          <h2 className="text-heading text-fg">{title}</h2>
        )}
        <p className="text-caption text-fg-subtle">{subtitle}</p>
      </div>

      {rows.length === 0 ? (
        <EmptyState
          size="sm"
          title="No ranked posts yet"
          description={`${BUILDING_HISTORY} Posts appear here once a daily snapshot has captured them in this window.`}
        />
      ) : (
        <>
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
            {pageRows.map((row, i) => {
              const rank = start + i + 1;
              return (
                <ContentCard
                  key={`${row.externalPostId}-${rank}`}
                  row={row}
                  rank={rank}
                  metric={metric}
                />
              );
            })}
          </ul>

          {totalPages > 1 && (
            <div className="mt-5 flex flex-wrap items-center justify-between gap-x-3 gap-y-2 border-t border-line-subtle pt-4">
              <span className="tnum text-caption text-fg-subtle">
                {`${start + 1}–${start + pageRows.length} of ${rows.length}`}
              </span>
              <div className="flex items-center gap-2">
                <Button
                  variant="secondary"
                  size="sm"
                  className="h-10 sm:h-8"
                  onClick={() => setPage(Math.max(0, current - 1))}
                  disabled={current === 0}
                >
                  Prev
                </Button>
                <span className="tnum min-w-[68px] text-center text-caption text-fg-muted">
                  {`${current + 1} / ${totalPages}`}
                </span>
                <Button
                  variant="secondary"
                  size="sm"
                  className="h-10 sm:h-8"
                  onClick={() => setPage(Math.min(totalPages - 1, current + 1))}
                  disabled={current >= totalPages - 1}
                >
                  Next
                </Button>
              </div>
            </div>
          )}
        </>
      )}
    </Card>
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
  const value = metric === 'views' ? row.currentViews : postInteractions(row);
  const unit = metric === 'views' ? 'views' : 'interactions';
  const who = row.creatorName ?? row.handle ?? 'Unknown creator';

  return (
    <li>
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className={clsx(
          'group relative block aspect-[9/16] overflow-hidden rounded-xl border bg-surface-subtle',
          'transition-colors duration-150 ease-out',
          isWinner
            ? 'border-line-strong'
            : 'border-line hover:border-line-strong',
        )}
      >
        {row.thumbnailUrl ? (
          <Image
            src={row.thumbnailUrl}
            alt=""
            fill
            sizes="(max-width: 640px) 50vw, (max-width: 1280px) 25vw, 16vw"
            unoptimized
            className="absolute inset-0 size-full object-cover transition-opacity duration-150 ease-out group-hover:opacity-90"
          />
        ) : (
          <div className="absolute inset-0 grid place-items-center text-fg-subtle">
            <Icon size={28} aria-hidden />
          </div>
        )}

        {/* Rank. #1 earns weight and a hairline, never hue — the page keeps
            its one yellow mark for the creator table's #1. */}
        <span
          className={clsx(
            'tnum absolute left-2 top-2 flex size-7 items-center justify-center rounded-full text-caption',
            isWinner
              ? 'bg-black/80 font-semibold text-fg ring-1 ring-line-strong'
              : 'bg-black/65 text-fg',
          )}
        >
          {String(rank).padStart(2, '0')}
        </span>
        <span className="absolute right-2 top-2 flex size-7 items-center justify-center rounded-full bg-black/65 text-fg">
          <Icon size={13} aria-hidden />
          <span className="sr-only">{PLATFORM_LABELS[platformKey]}</span>
        </span>

        {/* Scrim, not decoration: the caption below is unreadable on a bright
            thumbnail without it. Single-axis, black to transparent. */}
        <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/90 via-black/55 to-transparent p-3 pt-8">
          <p className="tnum text-heading leading-tight text-fg">
            {compactFormatter.format(value)}
          </p>
          <p className="text-caption text-fg-muted">{unit}</p>
          <p className="mt-1 truncate text-caption text-fg-muted">{who}</p>
          {row.alsoOn && row.alsoOn.length > 0 && (
            <p className="mt-1 flex items-center gap-1 text-micro text-fg-subtle">
              <span>also on</span>
              {row.alsoOn.map((p) => {
                const AlsoIcon = PLATFORM_ICONS[toPlatformKey(p)];
                return AlsoIcon ? (
                  <AlsoIcon key={p} size={11} aria-hidden />
                ) : null;
              })}
              <span className="sr-only">
                {row.alsoOn
                  .map((p) => PLATFORM_LABELS[toPlatformKey(p)])
                  .join(', ')}
              </span>
            </p>
          )}
        </div>
      </a>
    </li>
  );
}
