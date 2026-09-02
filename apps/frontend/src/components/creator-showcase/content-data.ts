import type { PlatformKey } from '../ui/platform-icons';

/**
 * Shapes and formatters for the creator content grid.
 *
 * Everything here is presentation-only: the rows themselves come from
 * `getCreatorPlatformDetail` (lib/queries.ts) and are mapped into `ContentPost`
 * by the platform page. There is deliberately no sample/mock generator any
 * more — a showcase whose whole promise is "real numbers, unedited" must never
 * be able to fall back to invented posts.
 */

export type ContentType = 'image' | 'video' | 'reel' | 'carousel';

export interface ContentMetrics {
  likes: number;
  comments: number;
  shares: number;
  views: number | null;
  saves: number | null;
}

export interface ContentPost {
  id: string;
  creatorSlug: string;
  platform: PlatformKey;
  externalId: string;
  /** Original post URL on the platform */
  url: string;
  type: ContentType;
  /** Already run through resolveMediaUrl() — either Supabase Storage or the
   *  same-origin /api/proxy-image hop. Never a raw social-CDN URL. */
  thumbnailUrl: string | null;
  caption: string;
  hashtags: string[];
  /** ISO timestamp */
  publishedAt: string;
  metrics: ContentMetrics;
  /** Carousel size, null otherwise */
  mediaCount: number | null;
  /** Video length in seconds, null otherwise */
  durationSec: number | null;
}

/** Aspect class per platform — IG/FB square, TikTok/Douyin portrait 9:16, XHS 3:4 */
export const PLATFORM_ASPECT: Record<PlatformKey, string> = {
  instagram: 'aspect-square',
  facebook: 'aspect-square',
  tiktok: 'aspect-[9/16]',
  douyin: 'aspect-[9/16]',
  xiaohongshu: 'aspect-[3/4]',
};

// --- Formatters -----------------------------------------------------------

const compactFmt = new Intl.NumberFormat('en-US', {
  notation: 'compact',
  compactDisplay: 'short',
  maximumFractionDigits: 1,
});

const exactFmt = new Intl.NumberFormat('en-US');

export function formatCompact(n: number): string {
  return compactFmt.format(n);
}

export function formatExact(n: number): string {
  return exactFmt.format(n);
}

export function formatDuration(sec: number | null): string {
  if (sec == null) return '';
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

// Absolute dates, pinned to UTC, rather than "3d ago": a relative label reads
// the clock at render time, so it differs between the server and client render
// of the same post and has to be papered over with suppressHydrationWarning.
// A published date is also the more useful fact on an analytics page.
const shortDateFmt = new Intl.DateTimeFormat('en-GB', {
  day: 'numeric',
  month: 'short',
  year: '2-digit',
  timeZone: 'UTC',
});

const longDateFmt = new Intl.DateTimeFormat('en-GB', {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
  timeZone: 'UTC',
});

/** "12 Aug 26" — the chip on a thumbnail. */
export function formatPostDate(iso: string): string {
  const t = Date.parse(iso);
  return Number.isNaN(t) ? '' : shortDateFmt.format(t);
}

/** "12 August 2026" — the detail line in the lightbox. */
export function formatPostDateLong(iso: string): string {
  const t = Date.parse(iso);
  return Number.isNaN(t) ? '' : longDateFmt.format(t);
}

/**
 * The one number a thumbnail leads with: views where the platform reports
 * them, likes otherwise. The label ships with the value — a grid of bare
 * numbers where some are views and some are likes is unreadable.
 */
export function formatPrimaryMetric(post: ContentPost): {
  label: string;
  value: string;
} {
  if (post.metrics.views != null) {
    return { label: 'views', value: formatCompact(post.metrics.views) };
  }
  return { label: 'likes', value: formatCompact(post.metrics.likes) };
}
