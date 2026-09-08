/**
 * Shared 7D/30D/90D/Lifetime selector for /me. Pure server component:
 * URL-as-state via <Link href="/me?window=…"> tabs, no client JS.
 *
 * Rendered as one segmented control rather than four loose chips, because the
 * window it selects is the scope of every number on the page — if a creator
 * misreads it, they misread the whole dashboard. The active segment carries the
 * solid brand fill DESIGN.md §1 reserves for the active nav indicator; it is
 * the only yellow on the page.
 */
import Link from 'next/link';

import type { MetricWindow } from '@gitroom/frontend/lib/metrics-windowed';
import { WINDOW_LABEL } from '@gitroom/frontend/lib/me-window';

const WINDOWS: MetricWindow[] = ['7d', '30d', '90d', 'lifetime'];

export function WindowTabs({ current }: { current: MetricWindow }) {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
      <span
        id="window-tabs-label"
        className="text-micro uppercase text-fg-subtle"
      >
        Time window
      </span>
      <nav
        aria-labelledby="window-tabs-label"
        className="inline-flex items-center gap-1 rounded-full border border-line bg-surface-subtle p-1"
      >
        {WINDOWS.map((w) => {
          const active = w === current;
          return (
            <Link
              key={w}
              href={`/me?window=${w}`}
              scroll={false}
              aria-current={active ? 'page' : undefined}
              className={`inline-flex h-10 items-center rounded-full px-4 text-label transition-colors duration-150 ease-out sm:h-8 sm:px-3.5 sm:text-caption ${
                active
                  ? 'bg-brand font-medium text-fg-on-brand'
                  : 'text-fg-muted hover:bg-white/[0.05] hover:text-fg'
              }`}
            >
              {WINDOW_LABEL[w]}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
