// apps/frontend/src/components/insights/insights-panel.tsx
import type { OwnedInsights } from '@gitroom/frontend/lib/owned-insights';
import { DemographicBars } from './demographic-bars';

function StatTile({ label, value }: { label: string; value: number | null }) {
  return (
    <div className="glass-base border border-borderGlass rounded-xl px-4 py-3 flex flex-col gap-1">
      <span className="text-caption text-fgSubtle">{label}</span>
      <span className="text-heading text-fg tabular-nums">
        {value == null ? '—' : value.toLocaleString()}
      </span>
    </div>
  );
}

export function InsightsPanel({ data }: { data: OwnedInsights }) {
  const latest = data.profile[data.profile.length - 1];
  if (!latest && data.demographics.length === 0) return null;
  return (
    <section className="glass-subtle border border-borderGlass rounded-2xl p-6 flex flex-col gap-5">
      <div>
        <h3 className="text-heading text-fg">Owner insights</h3>
        <p className="text-caption text-fgSubtle mt-1">
          Official metrics from your connected account · latest day
        </p>
      </div>
      {latest ? (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <StatTile label="Reach" value={latest.reach} />
          <StatTile label="Views" value={latest.views} />
          <StatTile
            label="Engaged"
            value={
              latest.accounts_engaged ??
              latest.page_engagements ??
              latest.total_interactions
            }
          />
          <StatTile label="Followers" value={latest.follower_total} />
        </div>
      ) : null}
      {data.demographics.length > 0 ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
          <DemographicBars
            rows={data.demographics}
            dimension="country"
            title="Top countries"
          />
          <DemographicBars
            rows={data.demographics}
            dimension="age"
            title="Age"
          />
          <DemographicBars
            rows={data.demographics}
            dimension="gender"
            title="Gender"
          />
          <DemographicBars
            rows={data.demographics}
            dimension="city"
            title="Top cities"
          />
        </div>
      ) : null}
    </section>
  );
}
