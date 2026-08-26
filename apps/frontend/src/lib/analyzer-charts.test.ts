/**
 * PRD 3 §6.9 criterion 7, C5's half: every row of §5.9.5's degenerate-input
 * table.
 */

import { buildCurve, buildRadar } from './analyzer-charts';
import { SCORE_KEYS, SCORE_MAX, type ScoreKey } from './analyzer-contract';

function scoreSet(values: number[]): Record<ScoreKey, number> {
  const out = {} as Record<ScoreKey, number>;
  SCORE_KEYS.forEach((k, i) => {
    out[k] = values[i];
  });
  return out;
}

const CENTRE = { x: 200, y: 150 };

describe('buildRadar (§5.9.5, §6.6)', () => {
  it('puts the first vertex at 12 o’clock and steps clockwise in SCORE_KEYS order', () => {
    const g = buildRadar(scoreSet([10, 10, 10, 10, 10, 10]));
    expect(g.vertices.map((v) => v.key)).toEqual([...SCORE_KEYS]);
    // 12 o'clock: same x as the centre, 100 above it.
    expect(g.vertices[0].point).toEqual({ x: 200, y: 50 });
    // Clockwise: the second vertex is to the RIGHT and below.
    expect(g.vertices[1].point.x).toBeGreaterThan(CENTRE.x);
    expect(g.vertices[1].point.y).toBeGreaterThan(50);
  });

  it('maps a score linearly, with NO minimum-radius floor', () => {
    const g = buildRadar(scoreSet([0, 5, 10, 0, 0, 0]));
    // 0 sits exactly on the centre.
    expect(g.vertices[0].point).toEqual(CENTRE);
    // 5 / 10 is half the radius.
    const half = g.vertices[1];
    const dx = half.point.x - CENTRE.x;
    const dy = half.point.y - CENTRE.y;
    expect(Math.round(Math.hypot(dx, dy))).toBe(50);
  });

  it('an all-zero report collapses every vertex onto the centre', () => {
    const g = buildRadar(scoreSet([0, 0, 0, 0, 0, 0]));
    for (const v of g.vertices) expect(v.point).toEqual(CENTRE);
    // The r=3 dots are what keep it visible; the polygon is degenerate.
    expect(g.polygon).toBe('200,150 200,150 200,150 200,150 200,150 200,150');
  });

  it('uses an epsilon sign test, so the vertical spokes anchor `middle`', () => {
    const g = buildRadar(scoreSet([7, 7, 7, 7, 7, 7]));
    // cos(-90°) is 6.1e-17 in floating point — a bare sign test gives `start`.
    expect(g.vertices[0].anchor).toBe('middle'); // 12 o'clock
    expect(g.vertices[3].anchor).toBe('middle'); // 6 o'clock
    expect(g.vertices[1].anchor).toBe('start'); // right of centre
    expect(g.vertices[2].anchor).toBe('start');
    expect(g.vertices[4].anchor).toBe('end'); // left of centre
    expect(g.vertices[5].anchor).toBe('end');
  });

  it('draws four hexagons and six spokes', () => {
    const g = buildRadar(scoreSet([1, 2, 3, 4, 5, 6]));
    expect(g.rings).toHaveLength(4);
    for (const ring of g.rings) expect(ring.split(' ')).toHaveLength(6);
    expect(g.spokes).toHaveLength(6);
    for (const spoke of g.spokes) expect(spoke.from).toEqual(CENTRE);
  });

  it('rounds every coordinate to 2 decimals', () => {
    const g = buildRadar(scoreSet([7, 7, 7, 7, 7, 7]));
    for (const v of g.vertices) {
      expect(v.point.x).toBe(Math.round(v.point.x * 100) / 100);
      expect(v.point.y).toBe(Math.round(v.point.y * 100) / 100);
    }
  });
});

describe('buildCurve (§5.9.5, §6.6)', () => {
  const PLOT = { left: 34, right: 708, top: 12, bottom: 172 };

  it('zero samples → empty, with no grid to rule', () => {
    const g = buildCurve([], 47);
    expect(g).toEqual({ polyline: '', dots: [], grid: [], empty: true });
  });

  it('null / undefined samples → empty', () => {
    expect(buildCurve(null, 47).empty).toBe(true);
    expect(buildCurve(undefined, 47).empty).toBe(true);
  });

  it('one sample → one dot, no polyline', () => {
    const g = buildCurve([{ t: 0, value: 10 }], 47);
    expect(g.empty).toBe(false);
    expect(g.dots).toHaveLength(1);
    expect(g.polyline).toBe('');
    // t=0 is the left edge; value=SCORE_MAX is the top of the plot.
    expect(g.dots[0].point).toEqual({ x: PLOT.left, y: PLOT.top });
  });

  it('duplicate t is KEPT — the vertical segment is the honest rendering', () => {
    const g = buildCurve(
      [
        { t: 5, value: 2 },
        { t: 5, value: 9 },
      ],
      47,
    );
    expect(g.dots).toHaveLength(2);
    expect(g.dots[0].point.x).toBe(g.dots[1].point.x);
    expect(g.dots[0].point.y).not.toBe(g.dots[1].point.y);
  });

  it('drops a non-finite t or value entirely', () => {
    const g = buildCurve(
      [
        { t: 1, value: 5 },
        { t: NaN, value: 5 },
        { t: 2, value: Infinity },
        { t: 3, value: 5 },
      ],
      47,
    );
    expect(g.dots).toHaveLength(2);
  });

  it('CLAMPS an out-of-domain t and exposes the clamped number', () => {
    // A sample at t = 100 on a 47 s video draws at the right edge and reads
    // 0:47, never 1:40.
    const g = buildCurve(
      [
        { t: -5, value: 5 },
        { t: 100, value: 5 },
      ],
      47,
    );
    expect(g.dots[0].t).toBe(0);
    expect(g.dots[0].point.x).toBe(PLOT.left);
    expect(g.dots[1].t).toBe(47);
    expect(g.dots[1].point.x).toBe(PLOT.right);
  });

  it('CLAMPS an out-of-range value and exposes the clamped number', () => {
    // So no <title> ever reads "87 / 10".
    const g = buildCurve(
      [
        { t: 1, value: 87 },
        { t: 2, value: -4 },
      ],
      47,
    );
    expect(g.dots[0].value).toBe(SCORE_MAX);
    expect(g.dots[0].point.y).toBe(PLOT.top);
    expect(g.dots[1].value).toBe(0);
    expect(g.dots[1].point.y).toBe(PLOT.bottom);
  });

  it('a null / 0 / non-finite duration with a non-empty raw curve is EMPTY, and logs', () => {
    const spy = jest
      .spyOn(console, 'error')
      .mockImplementation(() => undefined);
    for (const bad of [null, undefined, 0, -1, NaN, Infinity]) {
      const g = buildCurve([{ t: 1, value: 5 }], bad as number | null);
      // Never a fall back to max(t) — that draws a chart that lies.
      expect(g.empty).toBe(true);
      expect(g.dots).toEqual([]);
    }
    expect(spy).toHaveBeenCalledTimes(6);
    spy.mockRestore();
  });

  it('a bad duration with an EMPTY raw curve is the legal empty — no log', () => {
    const spy = jest
      .spyOn(console, 'error')
      .mockImplementation(() => undefined);
    expect(buildCurve([], null).empty).toBe(true);
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  it('above 60 SURVIVING samples, the polyline is drawn without dots', () => {
    const many = Array.from({ length: 61 }, (_v, i) => ({ t: i, value: 5 }));
    const g = buildCurve(many, 100);
    expect(g.dots).toEqual([]);
    expect(g.polyline.split(' ')).toHaveLength(61);
    expect(g.empty).toBe(false);
  });

  it('counts what SURVIVES: 61 raw with 2 non-finite keeps its dots', () => {
    const many: { t: number; value: number }[] = Array.from(
      { length: 59 },
      (_v, i) => ({ t: i, value: 5 }),
    );
    many.push({ t: NaN, value: 5 }, { t: 5, value: NaN });
    const g = buildCurve(many, 100);
    expect(g.dots).toHaveLength(59);
  });

  it('rules the grid at 0, SCORE_MAX / 2 and SCORE_MAX — never the literals', () => {
    const g = buildCurve([{ t: 1, value: 5 }], 47);
    expect(g.grid.map((r) => r.value)).toEqual([0, SCORE_MAX / 2, SCORE_MAX]);
    expect(g.grid[0].from).toEqual({ x: PLOT.left, y: PLOT.bottom });
    expect(g.grid[2].to).toEqual({ x: PLOT.right, y: PLOT.top });
  });

  it('rounds every coordinate to 2 decimals', () => {
    const g = buildCurve([{ t: 7, value: 3 }], 47);
    const { x, y } = g.dots[0].point;
    expect(x).toBe(Math.round(x * 100) / 100);
    expect(y).toBe(Math.round(y * 100) / 100);
  });
});
