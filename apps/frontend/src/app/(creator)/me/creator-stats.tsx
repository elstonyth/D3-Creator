import { type Translator, type Locale } from '@gitroom/frontend/lib/i18n';

import { getI18n } from '@gitroom/frontend/lib/i18n-server';
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

function deltaLine(
  delta: number,
  scope: string,
  t: Translator,
  locale: Locale
): string {
  if (delta === 0) return t('No change · {scope}', { scope });
  const caret = delta > 0 ? '▲' : '▼';
  return `${caret} ${formatDelta(delta, locale)} · ${scope}`;
}

export async function CreatorStats({
  row,
  metricWindow,
}: {
  row: CreatorMetricWindowRow;
  /** Named `metricWindow`, never `window` — a prop called `window` shadows
      globalThis.window for this whole scope. */
  metricWindow: MetricWindow;
}) {
  const { locale, t } = await getI18n();
  const scope = t(WINDOW_SCOPE[metricWindow]);

  return (
    // Three stats into a 2-up grid leaves an empty fourth cell, and StatRow's
    // hairline `gap-px` backdrop shows through it as a lighter quarter-panel.
    // Go straight from one column to three.
    <StatRow className="sm:grid-cols-3">
      <Stat
        label={t('Followers')}
        size="lg"
        value={formatCompact(row.followers, locale)}
        meta={
          row.insufficient
            ? t(BUILDING_HISTORY)
            : deltaLine(row.followersDelta, scope, t, locale)
        }
      />
      <Stat
        label={t('Views gained')}
        size="lg"
        value={formatWindowedValue(false, row.viewsGained, (value) =>
          formatCompact(value, locale)
        )}
        meta={t('Across every tracked account · {scope}', { scope })}
      />
      <Stat
        label={t('Engagement')}
        size="lg"
        value={formatWindowedValue(false, row.engagement, (value) =>
          formatPercent(value, locale)
        )}
        meta={t('Likes ÷ views · {scope}', { scope })}
      />
    </StatRow>
  );
}
