/**
 * Chart geometry — PRD 3 §5.9.5. JSX-free, no DOM, no measurement: every
 * number comes from the viewBox. §6.6 owns what the SVG looks like; this file
 * owns where everything sits and every degenerate-input rule.
 */

import {
  SCORE_MAX,
  type EmotionPoint,
  type ScoreKey,
} from './analyzer-contract';
import { SCORE_KEYS } from './analyzer-contract';

export interface Point {
  x: number;
  y: number;
}

export interface RadarGeometry {
  /** viewBox '0 0 400 300'; centre (200,150); outer radius 100. */
  vertices: {
    key: ScoreKey;
    point: Point;
    label: Point;
    anchor: 'start' | 'middle' | 'end';
  }[];
  /** Four hexagons at 0.25 / 0.5 / 0.75 / 1 of the radius, each an SVG points string. */
  rings: string[];
  /** Six centre-to-rim spokes. */
  spokes: { from: Point; to: Point }[];
  /** The score polygon, as an SVG `points` string. */
  polygon: string;
}

export interface CurveGeometry {
  /** viewBox '0 0 720 200'; insets top 12, right 12, bottom 28, left 34. */
  polyline: string;
  /** One entry per surviving sample, in order. `t` and `value` are the CLAMPED values. */
  dots: { point: Point; t: number; value: number }[];
  /** Horizontal rules at value 0, SCORE_MAX / 2, SCORE_MAX, in that order. */
  grid: { from: Point; to: Point; value: number }[];
  /** True when there is nothing honest to draw — render §6.6's no-data line. */
  empty: boolean;
}

/** Coordinates are rounded to 2 decimals in both builders. */
const round2 = (n: number) => Math.round(n * 100) / 100;

const clamp = (n: number, low: number, high: number) =>
  Math.min(high, Math.max(low, n));

// ─────────────────────────────── radar ───────────────────────────────

const RADAR_CX = 200;
const RADAR_CY = 150;
const RADAR_R = 100;
/** Axis labels sit 18px outside the outer ring. */
const RADAR_LABEL_OFFSET = 18;
const RING_FRACTIONS = [0.25, 0.5, 0.75, 1] as const;

/** First vertex at 12 o'clock, clockwise, in SCORE_KEYS order (PRD 1 §8.7.1). */
function vertexAngle(index: number): number {
  return (-90 + index * 60) * (Math.PI / 180);
}

function polar(angle: number, radius: number): Point {
  return {
    x: round2(RADAR_CX + Math.cos(angle) * radius),
    y: round2(RADAR_CY + Math.sin(angle) * radius),
  };
}

export function buildRadar(scores: Record<ScoreKey, number>): RadarGeometry {
  const vertices: RadarGeometry['vertices'] = SCORE_KEYS.map((key, i) => {
    const angle = vertexAngle(i);
    const cos = Math.cos(angle);
    // Linear, and a 0 sits exactly on the centre — no minimum-radius floor.
    // Inflating a 0 into a visible bump makes the chart flatter than the data;
    // the r=3 vertex dots stop an all-zero report rendering as nothing.
    const radius = (clamp(scores[key], 0, SCORE_MAX) / SCORE_MAX) * RADAR_R;
    return {
      key,
      point: polar(angle, radius),
      label: polar(angle, RADAR_R + RADAR_LABEL_OFFSET),
      // The sign test compares against ±1e-6, not 0: cos(-90°) is 6.1e-17 in
      // floating point, so a bare sign test gives `start` on the vertical
      // spokes.
      anchor: cos > 1e-6 ? 'start' : cos < -1e-6 ? 'end' : 'middle',
    };
  });

  const rings = RING_FRACTIONS.map((fraction) =>
    SCORE_KEYS.map((_key, i) => {
      const p = polar(vertexAngle(i), RADAR_R * fraction);
      return `${p.x},${p.y}`;
    }).join(' '),
  );

  const spokes = SCORE_KEYS.map((_key, i) => ({
    from: { x: RADAR_CX, y: RADAR_CY },
    to: polar(vertexAngle(i), RADAR_R),
  }));

  return {
    vertices,
    rings,
    spokes,
    polygon: vertices.map((v) => `${v.point.x},${v.point.y}`).join(' '),
  };
}

// ─────────────────────────────── curve ───────────────────────────────

const PLOT_LEFT = 34;
const PLOT_RIGHT = 708; // 720 - 12
const PLOT_TOP = 12;
const PLOT_BOTTOM = 172; // 200 - 28
const PLOT_WIDTH = PLOT_RIGHT - PLOT_LEFT; // 674
const PLOT_HEIGHT = PLOT_BOTTOM - PLOT_TOP; // 160

/** Above this many SURVIVING samples, draw the polyline only. */
const MAX_DOTS = 60;

const EMPTY_CURVE: CurveGeometry = {
  polyline: '',
  dots: [],
  // On `empty`, `grid` is [] too: there is no plot to rule.
  grid: [],
  empty: true,
};

export function buildCurve(
  samples: readonly EmotionPoint[] | null | undefined,
  durationSeconds: number | null | undefined,
): CurveGeometry {
  const raw = Array.isArray(samples) ? samples : [];

  const durationOk =
    typeof durationSeconds === 'number' &&
    Number.isFinite(durationSeconds) &&
    durationSeconds > 0;

  // Checked BEFORE non-finite samples are dropped. Never fall back to max(t) —
  // that draws a chart that lies about where the peaks are. This is the one
  // place that can still tell a contract violation apart from the legal
  // zero-sample `empty`, so the console.error lives here.
  if (!durationOk) {
    if (raw.length > 0) {
      console.error(
        '[analyzer-charts] emotion_curve has samples but duration_seconds is not a positive finite number; refusing to plot',
        { durationSeconds, samples: raw.length },
      );
    }
    return EMPTY_CURVE;
  }
  const duration = durationSeconds as number;

  const kept: CurveGeometry['dots'] = [];
  for (const sample of raw) {
    if (typeof sample !== 'object' || sample === null) continue;
    const { t, value } = sample;
    // There is no honest position for a NaN on either axis.
    if (typeof t !== 'number' || !Number.isFinite(t)) continue;
    if (typeof value !== 'number' || !Number.isFinite(value)) continue;
    // Clamp, and expose the CLAMPED numbers, so no <title> ever reads
    // "87 / 10" and no sample past the end shows an unseekable timecode.
    const ct = clamp(t, 0, duration);
    const cv = clamp(value, 0, SCORE_MAX);
    kept.push({
      point: {
        x: round2(PLOT_LEFT + (ct / duration) * PLOT_WIDTH),
        y: round2(PLOT_BOTTOM - (cv / SCORE_MAX) * PLOT_HEIGHT),
      },
      t: ct,
      value: cv,
    });
    // Duplicate `t` is kept: the vertical segment is the honest rendering of
    // the service bug PRD 1 §8.7.4 names.
  }

  if (kept.length === 0) return EMPTY_CURVE;

  const grid = [0, SCORE_MAX / 2, SCORE_MAX].map((value) => {
    const y = round2(PLOT_BOTTOM - (value / SCORE_MAX) * PLOT_HEIGHT);
    return {
      from: { x: PLOT_LEFT, y },
      to: { x: PLOT_RIGHT, y },
      value,
    };
  });

  return {
    // One sample draws a dot and no line.
    polyline:
      kept.length > 1
        ? kept.map((d) => `${d.point.x},${d.point.y}`).join(' ')
        : '',
    dots: kept.length > MAX_DOTS ? [] : kept,
    grid,
    empty: false,
  };
}
