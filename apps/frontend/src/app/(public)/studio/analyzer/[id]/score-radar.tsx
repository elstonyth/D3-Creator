/**
 * The six-dimension radar — PRD 3 §6.6. Pure server-rendered inline SVG; no
 * chart library. All geometry comes from `lib/analyzer-charts.ts`.
 *
 * The `max-w-[560px]` wrapper lives HERE, not in page.tsx, so the component is
 * complete on its own and the cap cannot be forgotten at one call site.
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
    <div className="max-w-[560px] mx-auto">
      <svg
        viewBox="0 0 400 300"
        role="img"
        aria-label={label}
        className="w-full h-auto"
      >
        {geometry.rings.map((points) => (
          <polygon
            key={points}
            points={points}
            className="fill-none stroke-chartGrid"
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
            className="stroke-chartGrid"
            strokeWidth="1"
          />
        ))}
        <polygon
          points={geometry.polygon}
          className="fill-chartGrid stroke-chartLine"
          strokeWidth="2"
        />
        {geometry.vertices.map((vertex) => (
          <text
            key={vertex.key}
            x={vertex.label.x}
            y={vertex.label.y}
            textAnchor={vertex.anchor}
            dominantBaseline="middle"
            className="text-micro fill-fgSubtle"
          >
            {SCORE_AXIS_LABEL[vertex.key]}
          </text>
        ))}
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
              r="3"
              className="fill-chartLine motion-safe:group-hover:fill-aurora-cta transition-colors duration-150 ease-out"
            >
              <title>{`${SCORE_CARD_LABEL[vertex.key]}: ${scores[vertex.key]} / ${SCORE_MAX}`}</title>
            </circle>
          </g>
        ))}
      </svg>
    </div>
  );
}
