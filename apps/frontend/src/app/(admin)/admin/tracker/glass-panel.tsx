/**
 * The board's surface.
 *
 * `lens` panels are `@samasante/liquid-glass` in material mode: the wrapper's
 * translucent background (tracker.module.scss `.glass`) is the tint; the
 * library frosts and edge-lights it everywhere and bends the live page behind
 * it in Chrome/Edge. Children render crisp on top.
 *
 * The wide panels (calendar, tasks, events, remarks, staffing) are frost-only
 * CSS glass. That is the library's own guidance for very wide surfaces, and
 * it is where the frame budget went: a backdrop SVG displacement filter is
 * re-run for every panel on every frame of the aurora behind it, and seven of
 * them measured at 16 fps against 32 fps with plain blur.
 *
 * The library defaults to `display: inline-block`; every panel here is a
 * column, so that is set explicitly and callers override via `style`.
 */

import type { HTMLAttributes } from 'react';
import { Glass, type GlassOptics } from '@samasante/liquid-glass';
import { cn } from '@gitroom/frontend/lib/utils';
import s from './tracker.module.scss';

// One displacement pass (dispersion off) and a modest blur: the lens sits
// over an always-animating backdrop, so its filter re-runs every frame.
const PANEL_OPTICS: Partial<GlassOptics> = {
  frost: 14,
  saturate: 1.4,
  strength: 0.045,
  bend: 0.4,
  bendWidth: 0.12,
  dispersion: 0,
  sheen: 0.45,
  glow: 0.1,
  specular: 1.1,
};

export function GlassPanel({
  accent = false,
  lens = false,
  className,
  style,
  ...rest
}: HTMLAttributes<HTMLDivElement> & { accent?: boolean; lens?: boolean }) {
  const cls = cn(s.glass, accent && s.glassAccent, className);
  const st = { display: 'flex', flexDirection: 'column', ...style } as const;
  if (!lens) return <div className={cls} style={st} {...rest} />;
  return <Glass optics={PANEL_OPTICS} className={cls} style={st} {...rest} />;
}
