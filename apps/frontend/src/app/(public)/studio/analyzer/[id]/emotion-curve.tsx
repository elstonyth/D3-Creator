/**
 * The emotion curve — PRD 3 §6.6. Pure server-rendered inline SVG. x is seconds
 * over 0 … duration_seconds, the video's own length; y is a fixed 0–SCORE_MAX
 * domain. All geometry comes from `lib/analyzer-charts.ts`.
 *
 * The no-data line is returned BEFORE the max-w wrapper, never inside it, so
 * the sentence spans the card's full content width instead of being inset by a
 * 560px cap meant for a chart.
 */

import type { ReactElement } from 'react';

import { buildCurve } from '@gitroom/frontend/lib/analyzer-charts';
import {
  SCORE_MAX,
  formatTimecode,
  type EmotionPoint,
} from '@gitroom/frontend/lib/analyzer-contract';

/** y captions sit 8px left of the plot; x captions 20px below its floor. */
const Y_CAPTION_GAP = 8;
const X_CAPTION_GAP = 20;

export function EmotionCurve({
  samples,
  durationSeconds,
}: {
  samples: readonly EmotionPoint[];
  durationSeconds: number | null;
}): ReactElement {
  const geometry = buildCurve(samples, durationSeconds);

  if (geometry.empty) {
    return (
      <p className="text-body text-fg-muted">
        No emotion data was returned for this video.
      </p>
    );
  }

  const floor = geometry.grid[0]; // value 0 — the plot's bottom-left/right
  const ceiling = geometry.grid[geometry.grid.length - 1]; // value SCORE_MAX
  const duration = formatTimecode(durationSeconds ?? 0);

  // Read from geometry.dots, so above 60 samples (where the geometry empties
  // `dots`) the label is the leading sentence alone — no enumeration, no
  // trailing separator.
  const enumeration = geometry.dots
    .map((dot) => `${formatTimecode(dot.t)} ${dot.value}`)
    .join(', ');
  const label =
    `Emotion curve over ${duration}, each point scored out of ${SCORE_MAX}.` +
    (enumeration === '' ? '' : ` ${enumeration}`);

  return (
    <div className="max-w-[560px] mx-auto">
      <svg
        viewBox="0 0 720 200"
        role="img"
        aria-label={label}
        className="w-full h-auto"
      >
        {geometry.grid.map((rule) => (
          <line
            key={rule.value}
            x1={rule.from.x}
            y1={rule.from.y}
            x2={rule.to.x}
            y2={rule.to.y}
            className="stroke-line"
            strokeWidth="1"
          />
        ))}

        <text
          x={ceiling.from.x - Y_CAPTION_GAP}
          y={ceiling.from.y}
          textAnchor="end"
          dominantBaseline="middle"
          className="text-micro fill-fg-subtle"
        >
          {SCORE_MAX}
        </text>
        <text
          x={floor.from.x - Y_CAPTION_GAP}
          y={floor.from.y}
          textAnchor="end"
          dominantBaseline="middle"
          className="text-micro fill-fg-subtle"
        >
          0
        </text>

        <text
          x={floor.from.x}
          y={floor.from.y + X_CAPTION_GAP}
          textAnchor="start"
          className="text-micro fill-fg-subtle"
        >
          0:00
        </text>
        <text
          x={floor.to.x}
          y={floor.from.y + X_CAPTION_GAP}
          textAnchor="end"
          className="text-micro fill-fg-subtle"
        >
          {duration}
        </text>

        {geometry.polyline !== '' && (
          <polyline
            points={geometry.polyline}
            className="fill-none stroke-fg-muted"
            strokeWidth="2"
          />
        )}

        {geometry.dots.map((dot) => (
          <g key={`${dot.point.x},${dot.point.y}`} className="group">
            <circle
              cx={dot.point.x}
              cy={dot.point.y}
              r="10"
              className="fill-transparent"
            />
            <circle
              cx={dot.point.x}
              cy={dot.point.y}
              r="3"
              className="fill-fg-muted motion-safe:group-hover:fill-brand transition-colors duration-150 ease-out"
            >
              <title>{`${formatTimecode(dot.t)} — ${dot.value} / ${SCORE_MAX}`}</title>
            </circle>
          </g>
        ))}
      </svg>
    </div>
  );
}
