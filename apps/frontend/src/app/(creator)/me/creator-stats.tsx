/**
 * CreatorStats — the 3-KPI body of /me for the selected time window.
 *
 * Followers (absolute + window delta), views gained in the window, engagement
 * for the window. Engagement is private to /me. Every cell states the window it
 * covers, because "which window is this number?" is the single biggest source
 * of confusion on this product. Insufficient history → "Building history…".
 */
import type {
  CreatorMetricWindowRow,
  MetricWindow,
} from '@gitroom/frontend/lib/metrics-windowed';
import {
  formatCompact,
  formatDelta,
  formatPercent,
} from '@gitroom/frontend/lib/creator-metrics';
import {
  BUILDING_HISTORY,
  formatWindowedValue,
} from '@gitroom/frontend/lib/format-metric';
import { Stat, StatRow } from '@gitroom/frontend/components/ui/stat';

/** Spelled-out window, for captions. WINDOW_LABEL's "30D" is for the tabs. */
export const WINDOW_SCOPE: Record<MetricWindow, string> = {
  '7d': 'last 7 days',
  '30d': 'last 30 days',
  '90d': 'last 90 days',
  lifetime: 'all time',
};

function deltaLine(delta: number, scope: string): string {
  if (delta === 0) return `No change · ${scope}`;
  const caret = delta > 0 ? '▲' : '▼';
  return `${caret} ${formatDelta(delta)} · ${scope}`;
}

export function CreatorStats({
  row,
  metricWindow,
}: {
  row: CreatorMetricWindowRow;
  /** Named `metricWindow`, never `window` — a prop called `window` shadows
      globalThis.window for this whole scope. */
  metricWindow: MetricWindow;
}) {
  const scope = WINDOW_SCOPE[metricWindow];

  return (
    // Three stats into a 2-up grid leaves an empty fourth cell, and StatRow's
    // hairline `gap-px` backdrop shows through it as a lighter quarter-panel.
    // Go straight from one column to three.
    <StatRow className="sm:grid-cols-3">
      <Stat
        label="Followers"
        size="lg"
        value={formatCompact(row.followers)}
        meta={
          row.insufficient
            ? BUILDING_HISTORY
            : deltaLine(row.followersDelta, scope)
        }
      />
      <Stat
        label="Views gained"
        size="lg"
        value={formatWindowedValue(false, row.viewsGained, formatCompact)}
        meta={`Across every tracked account · ${scope}`}
      />
      <Stat
        label="Engagement"
        size="lg"
        value={formatWindowedValue(false, row.engagement, formatPercent)}
        meta={`Likes ÷ views · ${scope}`}
      />
    </StatRow>
  );
}
