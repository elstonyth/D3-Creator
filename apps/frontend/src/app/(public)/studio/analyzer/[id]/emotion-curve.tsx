/**
 * The emotion curve — PRD 3 §6.6. Pure server-rendered inline SVG. x is seconds
 * over 0 … duration_seconds, the video's own length; y is a fixed 0–SCORE_MAX
 * domain. All geometry comes from `lib/analyzer-charts.ts`.
 *
 * EVERY LABEL IS HTML, NOT <text>. The viewBox is 720 wide and the SVG scales
 * to its container, so an 11-unit <text> node rendered at about 4px inside a
 * card on a 360px screen. HTML captions outside the SVG stay 12px at every
 * width, which is the only way this chart is legible on a phone. The y domain
 * moved into the caption; the two x endpoints sit in a row under the plot,
 * inset to the plot's own left and right margins.
 *
 * The viewBox is CROPPED to `28 6 686 172` rather than `buildCurve`'s own
 * `0 0 720 200`: the 34-unit left gutter and 28-unit bottom gutter existed only
 * to hold the axis <text> nodes, and leaving them in floated the plot above its
 * own HTML axis row. Nothing is clipped — a value-0 dot sits at y=172 and its
 * r=3.5 reaches 175.5, inside the 178 floor.
 *
 * The no-data line is returned BEFORE the figure, never inside it, so the
 * sentence spans the card's full content width instead of sitting under an
 * empty plot.
 */

import type { ReactElement } from 'react';

import { buildCurve } from '@gitroom/frontend/lib/analyzer-charts';
import {
  SCORE_MAX,
  formatTimecode,
  type EmotionPoint,
} from '@gitroom/frontend/lib/analyzer-contract';

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
      <div className="flex flex-col gap-2">
        <h3 className="text-heading text-fg">Emotion curve</h3>
        <p className="text-body text-fg-muted">
          No emotion data was returned for this video.
        </p>
      </div>
    );
  }

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
    <figure className="flex flex-col gap-4">
      <figcaption className="flex flex-col gap-1">
        <h3 className="text-heading text-fg">Emotion curve</h3>
        <p className="text-caption text-fg-subtle">
          Emotional pitch left to right across the full {duration} · vertical
          axis 0–{SCORE_MAX}
        </p>
      </figcaption>

      <div className="flex flex-col gap-1">
        <svg
          viewBox="28 6 686 172"
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

          {geometry.polyline !== '' && (
            <polyline
              points={geometry.polyline}
              className="fill-none stroke-fg-muted"
              strokeWidth="2"
              strokeLinejoin="round"
              strokeLinecap="round"
            />
          )}

          {/* Keyed by position, not by coordinate: buildCurve deliberately
              keeps duplicate `t` values, so two samples sharing a t AND a value
              produce the same point and would collide on a coordinate key. */}
          {geometry.dots.map((dot, index) => (
            <g key={index} className="group">
              {/* A 3px target is unhittable — the transparent circle is the hit
                  area, and hovering it turns that one dot yellow. It is the one
                  active datum this chart is allowed to highlight. */}
              <circle
                cx={dot.point.x}
                cy={dot.point.y}
                r="12"
                className="fill-transparent"
              />
              <circle
                cx={dot.point.x}
                cy={dot.point.y}
                r="3.5"
                className="fill-fg-muted motion-safe:group-hover:fill-brand transition-colors duration-150 ease-out"
              >
                <title>{`${formatTimecode(dot.t)} — ${dot.value} / ${SCORE_MAX}`}</title>
              </circle>
            </g>
          ))}
        </svg>

        {/* The x axis. Percentage insets, so the two endpoints stay over the
            plot's first and last column at any width. Aria-hidden: the SVG's
            own aria-label already names the window in words. */}
        <div
          aria-hidden
          className="tnum flex items-baseline justify-between px-[0.87%] text-caption text-fg-subtle"
        >
          <span>0:00</span>
          <span>{duration}</span>
        </div>
      </div>
    </figure>
  );
}
