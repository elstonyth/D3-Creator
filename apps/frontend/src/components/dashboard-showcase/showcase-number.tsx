import { compactFormatter, formatShowcase } from './showcase-data';

/**
 * Responsive showcase number for the Top Creators tables.
 *
 * On phones (< `sm`) it renders the compact abbreviation ("30.1M", "683.8K")
 * so the wide full-digit form does not crowd / overlap the adjacent Creator
 * name. From `sm` up it shows the full-digit millions ("30,053,805") via
 * `formatShowcase()`, exactly as before.
 *
 * Two spans toggled by CSS (not a JS media query) — SSR-safe, no hydration
 * drift, and the hidden span (display:none) does not contribute to the grid
 * column's `auto` width, so the column shrinks to the compact value on mobile.
 */
export function ShowcaseNumber({ value }: { value: number }) {
  return (
    <>
      <span className="sm:hidden">{compactFormatter.format(value)}</span>
      <span className="hidden sm:inline">{formatShowcase(value)}</span>
    </>
  );
}
