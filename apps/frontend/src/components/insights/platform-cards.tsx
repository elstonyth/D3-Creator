// apps/frontend/src/components/insights/platform-cards.tsx
//
// One row per tracked account: who it is, what it is worth, where it goes.
// A list of hairline-separated rows rather than a grid of boxed cards — these
// are the same kind of thing repeated, not four unrelated panels.
import Link from 'next/link';
import {
  PLATFORM_ICONS,
  PLATFORM_LABELS,
} from '@gitroom/frontend/components/ui/platform-icons';
import { Badge } from '@gitroom/frontend/components/ui/badge';
import type { PlatformCard } from '@gitroom/frontend/lib/creator-platform-breakdown';

const compact = new Intl.NumberFormat('en-US', {
  notation: 'compact',
  maximumFractionDigits: 1,
});
function fmt(n: number | null): string {
  return n == null ? '—' : compact.format(n);
}

export function PlatformCards({
  cards,
  scope,
}: {
  cards: PlatformCard[];
  /** Window the view counts cover, e.g. "last 30 days". */
  scope?: string;
}) {
  if (cards.length === 0) return null;
  return (
    <section className="flex flex-col gap-5">
      <div className="max-w-prose">
        <h2 className="text-subsection text-fg">Your accounts</h2>
        <p className="mt-2 text-body text-fg-muted">
          {cards.length === 1
            ? 'The one account your agency tracks for you. Open it for its full post history.'
            : `The ${cards.length} accounts your agency tracks for you. Open one for its full post history.`}
        </p>
      </div>

      <ul className="divide-y divide-line-subtle overflow-hidden rounded-2xl border border-line bg-surface">
        {cards.map((c) => {
          const Icon = PLATFORM_ICONS[c.platform];
          return (
            <li key={c.platform}>
              <Link
                href={`/creators/${encodeURIComponent(c.handle)}/${c.platform}`}
                className="group flex min-h-[64px] items-center gap-4 px-4 py-3.5 transition-colors duration-150 ease-out hover:bg-white/[0.025] sm:px-5"
              >
                <span className="flex size-9 shrink-0 items-center justify-center rounded-full border border-line bg-surface-subtle text-fg">
                  <Icon size={16} />
                </span>

                <span className="min-w-0 flex-1">
                  <span className="block truncate text-label text-fg">
                    @{c.handle}
                  </span>
                  <span className="block text-caption text-fg-subtle">
                    {PLATFORM_LABELS[c.platform]}
                  </span>
                </span>

                <span className="hidden shrink-0 sm:block">
                  <Badge tone="muted">Tracked</Badge>
                </span>

                <span className="shrink-0 text-right">
                  <span className="tnum block text-label text-fg">
                    {fmt(c.followers)}
                  </span>
                  <span className="block text-caption text-fg-subtle">
                    followers
                  </span>
                </span>

                <span className="hidden shrink-0 text-right sm:block">
                  <span className="tnum block text-label text-fg">
                    {fmt(c.views)}
                  </span>
                  <span className="block text-caption text-fg-subtle">
                    {scope ? `views · ${scope}` : 'views'}
                  </span>
                </span>

                <span
                  aria-hidden
                  className="shrink-0 text-fg-subtle transition-colors duration-150 ease-out group-hover:text-fg"
                >
                  →
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
