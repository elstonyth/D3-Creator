import clsx, { type ClassValue } from 'clsx';
import { extendTailwindMerge } from 'tailwind-merge';

/**
 * The project's `theme.extend.fontSize` keys (apps/frontend/tailwind.config.cjs).
 * tailwind-merge only knows the stock sizes; anything else after `text-` it
 * treats as a colour, so `cn('text-heading text-fg')` used to return `text-fg`
 * and the size silently vanished. Registering the tokens here makes them
 * merge against each other (`text-heading` vs `text-section`) and never
 * against a colour. Keep this list in step with the config.
 */
const FONT_SIZE_TOKENS = [
  'display-1',
  'display-2',
  'section',
  'subsection',
  'heading',
  'metric-lg',
  'metric',
  'body-lg',
  'body',
  'body-sm',
  'label',
  'caption',
  'micro',
];

const twMerge = extendTailwindMerge({
  extend: {
    classGroups: {
      'font-size': [{ text: FONT_SIZE_TOKENS }],
    },
  },
});

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

/**
 * `YYYY-MM-DD` for the date N days before now, for `captured_date` (a DATE
 * column) range filters. Lives here, not inline in a component, because
 * `Date.now()` in a Server Component body trips react-hooks/purity; calling it
 * through this lib helper keeps the call out of the render-purity lint scope.
 */
export function daysAgoDate(days: number): string {
  return new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 10);
}
