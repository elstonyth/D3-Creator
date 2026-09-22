import { cn } from './utils';

describe('cn', () => {
  it('keeps a custom font-size token next to a text colour', () => {
    // tailwind-merge's default config only knows the stock sizes; without the
    // project's tokens registered it read `text-heading` as a colour and let
    // `text-fg` replace it.
    expect(cn('text-heading text-fg')).toBe('text-heading text-fg');
    expect(cn('text-body-sm text-fg-muted')).toBe('text-body-sm text-fg-muted');
    expect(cn('text-label', 'text-brand/15')).toBe('text-label text-brand/15');
    expect(cn('text-metric-lg tnum', 'text-brand')).toBe(
      'text-metric-lg tnum text-brand',
    );
  });

  it('still merges two font sizes and two colours', () => {
    expect(cn('text-heading', 'text-section')).toBe('text-section');
    expect(cn('text-body text-fg', 'text-fg-muted')).toBe(
      'text-body text-fg-muted',
    );
    expect(cn('text-micro uppercase', 'text-caption')).toBe(
      'uppercase text-caption',
    );
  });

  it('keeps the stock tailwind-merge behaviour otherwise', () => {
    expect(cn('px-2 py-1', 'p-4')).toBe('p-4');
    expect(cn('text-sm', 'text-lg')).toBe('text-lg');
    expect(cn('text-red-500', 'text-blue-500')).toBe('text-blue-500');
    expect(cn('a', false && 'b', undefined, 'c')).toBe('a c');
  });
});
