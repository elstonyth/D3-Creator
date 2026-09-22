'use client';

/**
 * The board's surface: `@samasante/liquid-glass` in material mode. The wrapper's
 * translucent background (tracker.module.scss `.glass`) is the tint; the
 * library frosts and edge-lights it everywhere and bends the live page behind
 * it in Chrome/Edge. Children render crisp on top.
 *
 * The library defaults to `display: inline-block`; every panel here is a
 * column, so that is set explicitly and callers override via `style`.
 */

import {
  Glass,
  type GlassOptics,
  type GlassProps,
} from '@samasante/liquid-glass';
import { cn } from '@gitroom/frontend/lib/utils';
import s from './tracker.module.scss';

// Heavier frost than the library default so text stays legible over the light
// orbs behind the board; a gentle rim bend, light dispersion, soft sheen.
const PANEL_OPTICS: Partial<GlassOptics> = {
  frost: 24,
  saturate: 1.5,
  strength: 0.045,
  bend: 0.5,
  bendWidth: 0.12,
  dispersion: 0.3,
  sheen: 0.45,
  glow: 0.12,
  specular: 1.1,
};

export function GlassPanel({
  accent = false,
  className,
  style,
  ...rest
}: GlassProps & { accent?: boolean }) {
  return (
    <Glass
      optics={PANEL_OPTICS}
      className={cn(s.glass, accent && s.glassAccent, className)}
      style={{ display: 'flex', flexDirection: 'column', ...style }}
      {...rest}
    />
  );
}
