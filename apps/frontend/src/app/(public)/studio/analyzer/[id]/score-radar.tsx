/**
 * The six-dimension radar — PRD 3 §6.6. Pure server-rendered inline SVG; no
 * chart library. All geometry comes from `lib/analyzer-charts.ts`.
 *
 * THE AXIS LABELS ARE HTML, NOT <text>. `buildRadar` places them 18 units
 * outside a 100-unit ring inside a 400-wide viewBox that scales to its
 * container: inside a card on a 360px screen that is roughly 7px of rendered
 * type, and the words are real words ("Engagement", "Prediction"), not single
 * digits. The legend below carries every axis name AND its number, so the
 * chart is readable at 360px and the values no longer live only in a hover
 * tooltip that a touch device never shows.
 *
 * The viewBox is cropped to the plot: `buildRadar` reserves an 18-unit label
 * ring that nothing draws in any more.
 */

import type { ReactElement } from 'react';

import { buildRadar } from '@gitroom/frontend/lib/analyzer-charts';
import {
  SCORE_AXIS_LABEL,
  SCORE_CARD_LABEL,
  SCORE_KEYS,
  SCORE_MAX,
  type ScoreKey,
} from '@gitroom/frontend/lib/analyzer-contract';

export function ScoreRadar({
  scores,
}: {
  scores: Record<ScoreKey, number>;
}): ReactElement {
  const geometry = buildRadar(scores);
  const label =
    `Radar chart of the six scores, each out of ${SCORE_MAX}. ` +
    SCORE_KEYS.map((k) => `${SCORE_AXIS_LABEL[k]} ${scores[k]}`).join(', ');

  return (
    <figure className="flex flex-col gap-4">
      <figcaption className="flex flex-col gap-1">
        <h3 className="text-heading text-fg">Score profile</h3>
        <p className="text-caption text-fg-subtle">
          Six dimensions on one shape · each axis 0 at the centre to {SCORE_MAX}{' '}
          at the rim
        </p>
      </figcaption>

      <div className="mx-auto w-full max-w-[320px]">
        <svg
          viewBox="80 30 240 240"
          role="img"
          aria-label={label}
          className="w-full h-auto"
        >
          {geometry.rings.map((points) => (
            <polygon
              key={points}
              points={points}
              className="fill-none stroke-line"
              strokeWidth="1"
            />
          ))}
          {geometry.spokes.map((spoke) => (
            <line
              key={`${spoke.to.x},${spoke.to.y}`}
              x1={spoke.from.x}
              y1={spoke.from.y}
              x2={spoke.to.x}
              y2={spoke.to.y}
              className="stroke-line"
              strokeWidth="1"
            />
          ))}
          <polygon
            points={geometry.polygon}
            className="fill-line stroke-fg-muted"
            strokeWidth="2"
            strokeLinejoin="round"
          />
          {geometry.vertices.map((vertex) => (
            <g key={vertex.key} className="group">
              {/* A 3px target is unhittable — the transparent circle is the hit
                  area, and hovering it turns that one dot yellow. */}
              <circle
                cx={vertex.point.x}
                cy={vertex.point.y}
                r="12"
                className="fill-transparent"
              />
              <circle
                cx={vertex.point.x}
                cy={vertex.point.y}
                r="3.5"
                className="fill-fg-muted motion-safe:group-hover:fill-brand transition-colors duration-150 ease-out"
              >
                <title>{`${SCORE_CARD_LABEL[vertex.key]}: ${scores[vertex.key]} / ${SCORE_MAX}`}</title>
              </circle>
            </g>
          ))}
        </svg>
      </div>

      {/* The axis legend. Clockwise from the top vertex, in SCORE_KEYS order,
          which is the order the polygon is drawn in. Hairlines, not six boxes. */}
      <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 border-t border-line-subtle">
        {SCORE_KEYS.map((key) => (
          <div
            key={key}
            className="flex items-baseline justify-between gap-3 border-b border-line-subtle py-2"
          >
            <dt className="text-caption text-fg-muted truncate">
              {SCORE_AXIS_LABEL[key]}
            </dt>
            <dd className="tnum text-caption text-fg shrink-0">
              {scores[key]}
              <span className="text-fg-subtle">/{SCORE_MAX}</span>
            </dd>
          </div>
        ))}
      </dl>
    </figure>
  );
}
