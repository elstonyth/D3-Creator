/**
 * Pure playlist logic for the online-classes course player. Given the classes a
 * viewer can see (already ordered by sort_order) and the one they're on, resolve
 * their position and the prev/next neighbours. Kept free of React/Supabase so it
 * stays unit-testable — see class-series.test.ts.
 */
export interface SeriesItem {
  id: string;
  title: string;
}

export interface SeriesNav<T extends SeriesItem> {
  items: T[];
  /** 0-based index of the current item, or -1 when not in the list. */
  currentIndex: number;
  /** 1-based position for display ("Part {position} of {total}"); 0 when absent. */
  position: number;
  total: number;
  prev: T | null;
  next: T | null;
}

export function buildSeriesNav<T extends SeriesItem>(
  items: T[],
  currentId: string,
): SeriesNav<T> {
  const currentIndex = items.findIndex((i) => i.id === currentId);
  const found = currentIndex >= 0;
  return {
    items,
    currentIndex,
    position: found ? currentIndex + 1 : 0,
    total: items.length,
    prev: found && currentIndex > 0 ? items[currentIndex - 1] : null,
    next:
      found && currentIndex < items.length - 1 ? items[currentIndex + 1] : null,
  };
}

const PART_MARKER = /\s*\(\d+\)\s*$/;

/**
 * Best-effort series/collection name from a class title by dropping a trailing
 * "(n)" part marker (e.g. "线上课 4月20-24 (1)" → "线上课 4月20-24"). Returns null
 * when there's nothing to strip, so the caller can hide the eyebrow rather than
 * repeat the full title.
 */
export function deriveSeriesLabel(title: string): string | null {
  const stripped = title.replace(PART_MARKER, '').trim();
  return stripped && stripped !== title.trim() ? stripped : null;
}
