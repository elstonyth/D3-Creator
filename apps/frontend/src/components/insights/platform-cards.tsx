// apps/frontend/src/components/insights/platform-cards.tsx
import Link from 'next/link';
import {
  PLATFORM_ICONS,
  PLATFORM_LABELS,
} from '@gitroom/frontend/components/ui/platform-icons';
import type { PlatformCard } from '@gitroom/frontend/lib/creator-platform-breakdown';

const compact = new Intl.NumberFormat('en-US', {
  notation: 'compact',
  maximumFractionDigits: 1,
});
function fmt(n: number | null): string {
  return n == null ? '—' : compact.format(n);
}

export function PlatformCards({ cards }: { cards: PlatformCard[] }) {
  if (cards.length === 0) return null;
  return (
    <section className="flex flex-col gap-4">
      <div>
        <h2 className="text-heading text-fg">Your platforms</h2>
        <p className="text-caption text-fg-subtle mt-1">
          Tap a platform to see its posts and views.
        </p>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {cards.map((c) => {
          const Icon = PLATFORM_ICONS[c.platform];
          return (
            <Link
              key={c.platform}
              href={`/creators/${encodeURIComponent(c.handle)}/${c.platform}`}
              className="group flex items-center justify-between gap-4 p-4 rounded-xl bg-surface-subtle border border-line border border-line hover:border-line-strong hover:bg-white/[0.04] transition-colors"
            >
              <span className="flex items-center gap-3 min-w-0">
                <span className="shrink-0 size-9 rounded-full bg-surface border border-line border border-line flex items-center justify-center text-fg">
                  <Icon size={16} />
                </span>
                <span className="min-w-0">
                  <span className="block text-label text-fg truncate">
                    @{c.handle}
                  </span>
                  <span className="block text-caption text-fg-subtle">
                    {PLATFORM_LABELS[c.platform]}
                  </span>
                </span>
              </span>
              <span className="flex items-center gap-3 shrink-0">
                <span className="text-right">
                  <span className="block text-label text-fg tabular-nums">
                    {fmt(c.followers)}
                  </span>
                  <span className="block text-caption text-fg-subtle tabular-nums">
                    {fmt(c.views)} views
                  </span>
                </span>
                <span className="text-micro px-2 py-0.5 rounded-full border bg-surface border border-line text-fg-muted border-line">
                  Tracked
                </span>
                <span
                  className="text-fg-subtle group-hover:text-fg transition-colors"
                  aria-hidden
                >
                  →
                </span>
              </span>
            </Link>
          );
        })}
      </div>
    </section>
  );
}
