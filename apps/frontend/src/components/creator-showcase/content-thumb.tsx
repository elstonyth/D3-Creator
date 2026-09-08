'use client';

import { useState } from 'react';
import clsx from 'clsx';
import { PLATFORM_ICONS, PLATFORM_LABELS } from '../ui/platform-icons';
import {
  formatDuration,
  formatPostDate,
  formatPrimaryMetric,
  PLATFORM_ASPECT,
  type ContentPost,
} from './content-data';

interface ContentThumbProps {
  post: ContentPost;
  onOpen: (post: ContentPost) => void;
}

/**
 * One tile in the content grid: the post image, the one number that post is
 * judged on, and its publish date. The caption slides in over the image on
 * hover/focus — it is context, not the headline.
 *
 * Thumbnails are signed social-CDN URLs proxied through /api/proxy-image and
 * expire, so a failed load falls back to the caption rather than the browser's
 * broken-image glyph.
 *
 * Every fill over the image is fully opaque `bg-canvas`. An alpha modifier on
 * a surface token looks right in source but generates NO CSS at all: those
 * tokens are `var(--canvas)` strings, and Tailwind can only fold an alpha into
 * a literal colour (which is why `bg-brand/10` works and this did not). The
 * metric bar was rendering white text straight onto the photo.
 */
export function ContentThumb({ post, onOpen }: ContentThumbProps) {
  const [failed, setFailed] = useState(false);

  const Icon = PLATFORM_ICONS[post.platform];
  const metric = formatPrimaryMetric(post);
  const date = formatPostDate(post.publishedAt);
  const showImage = post.thumbnailUrl != null && !failed;

  return (
    <button
      type="button"
      onClick={() => onOpen(post)}
      aria-label={`Open ${PLATFORM_LABELS[post.platform]} post${date ? ` from ${date}` : ''} — ${metric.value} ${metric.label}`}
      className={clsx(
        'group relative block w-full overflow-hidden rounded-xl border border-line bg-surface-subtle text-left',
        'transition-colors duration-150 ease-out hover:border-line-strong',
        'focus-visible:outline-none focus-visible:shadow-focus',
        PLATFORM_ASPECT[post.platform],
      )}
    >
      {showImage ? (
        // eslint-disable-next-line @next/next/no-img-element -- proxied external media, dimensions vary by platform
        <img
          src={post.thumbnailUrl ?? undefined}
          alt=""
          loading="lazy"
          decoding="async"
          // Social CDNs 403 when a Referer they don't recognise is sent; drop
          // the header so their public-asset path serves the file.
          referrerPolicy="no-referrer"
          onError={() => setFailed(true)}
          className="absolute inset-0 h-full w-full object-cover"
        />
      ) : (
        <div className="absolute inset-0 flex items-end p-4 pb-16">
          <p className="line-clamp-5 text-body-sm text-fg-muted">
            {post.caption || 'No caption'}
          </p>
        </div>
      )}

      {/* Caption on hover / keyboard focus. Solid fill, no blur (DESIGN.md §8). */}
      {showImage && post.caption ? (
        <div
          aria-hidden="true"
          className="absolute inset-0 flex items-end bg-canvas px-4 pb-16 pt-4 opacity-0 transition-opacity duration-150 ease-out group-hover:opacity-100 group-focus-visible:opacity-100 motion-reduce:transition-none"
        >
          <p className="line-clamp-5 text-body-sm text-fg">{post.caption}</p>
        </div>
      ) : null}

      <span className="absolute left-2 top-2 inline-flex size-6 items-center justify-center rounded-md border border-line bg-canvas text-fg">
        <Icon size={12} />
      </span>

      {post.durationSec != null ? (
        <span className="tnum absolute right-2 top-2 inline-flex h-5 items-center rounded border border-line bg-canvas px-1.5 text-micro text-fg">
          {formatDuration(post.durationSec)}
        </span>
      ) : post.type === 'carousel' && post.mediaCount != null ? (
        <span className="tnum absolute right-2 top-2 inline-flex h-5 items-center gap-1 rounded border border-line bg-canvas px-1.5 text-micro text-fg">
          <CarouselGlyph />
          {post.mediaCount}
        </span>
      ) : null}

      {/* Metric bar. Always visible — it is the reason the tile exists. The
          value sits over the date rather than beside it: side by side, a
          two-column tile at 360px leaves ~126px and the number truncates. */}
      <div className="absolute inset-x-0 bottom-0 border-t border-line bg-canvas px-3 py-2">
        <p className="tnum truncate text-caption text-fg">
          {metric.value} <span className="text-fg-subtle">{metric.label}</span>
        </p>
        {date ? (
          <p className="tnum truncate text-caption text-fg-subtle">{date}</p>
        ) : null}
      </div>
    </button>
  );
}

function CarouselGlyph() {
  return (
    <svg width="10" height="10" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <rect
        x="3"
        y="3"
        width="10"
        height="10"
        rx="1.5"
        stroke="currentColor"
        strokeWidth="1.2"
      />
      <rect
        x="5"
        y="1"
        width="10"
        height="10"
        rx="1.5"
        stroke="currentColor"
        strokeWidth="1.2"
      />
    </svg>
  );
}
