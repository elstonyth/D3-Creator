// apps/frontend/src/components/insights/demographic-bars.tsx
import type { DemoRow } from '@gitroom/frontend/lib/owned-insights';

export function DemographicBars({
  rows,
  dimension,
  title,
}: {
  rows: DemoRow[];
  dimension: string;
  title: string;
}) {
  const filtered = rows
    .filter((r) => r.dimension === dimension)
    .sort((a, b) => b.value - a.value)
    .slice(0, 6);
  if (filtered.length === 0) return null;
  const max = Math.max(...filtered.map((r) => r.value), 1);
  return (
    <div className="flex flex-col gap-2">
      <h4 className="text-caption text-fgSubtle uppercase tracking-wide">
        {title}
      </h4>
      <ul className="flex flex-col gap-1.5">
        {filtered.map((r) => (
          <li key={r.bucket} className="flex items-center gap-3">
            <span className="text-caption text-fgMuted w-20 truncate">
              {r.bucket}
            </span>
            <div className="flex-1 h-2 rounded-full bg-borderGlass overflow-hidden">
              <div
                className="h-full rounded-full bg-aurora-cta"
                style={{ width: `${Math.round((r.value / max) * 100)}%` }}
              />
            </div>
            <span className="text-caption text-fg tabular-nums w-12 text-right">
              {r.value.toLocaleString()}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
