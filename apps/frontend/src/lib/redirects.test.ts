import { isSafeRedirect, safeRedirect } from './redirects';

describe('safeRedirect', () => {
  it.each([
    ['/me', '/me'],
    ['/classes?x=1#h', '/classes?x=1#h'],
    // The URL parser drops a tab, so the caller gets the path it will visit.
    ['/cla\tsses', '/classes'],
  ])('keeps the in-app path %j as %j', (target, expected) => {
    expect(isSafeRedirect(target)).toBe(true);
    expect(safeRedirect(target, '/fallback')).toBe(expected);
  });

  it.each([
    '//evil.com',
    '/\\evil.com',
    // The parser strips tab, LF and CR, leaving the protocol-relative
    // "//evil.com" — a prefix check on "//" sees none of these coming.
    '/\t/evil.com',
    '/\n/evil.com',
    '/\r/evil.com',
    'https://evil.com',
    'javascript:alert(1)',
    '',
    null,
  ])('falls back for %j', (target) => {
    expect(isSafeRedirect(target)).toBe(false);
    expect(safeRedirect(target, '/fallback')).toBe('/fallback');
  });

  it.each([
    // Resolving collapses the dot segments into a pathname that starts with
    // "//", which reads as protocol-relative once it is a string again.
    '/..//evil.com',
    '/.//evil.com',
    '/a/..//evil.com',
    '/%2e%2e//evil.com',
  ])('falls back when %j normalises to "//evil.com"', (target) => {
    expect(safeRedirect(target, '/fallback')).toBe('/fallback');
  });

  it('refuses a repeated query param, which arrives as an array', () => {
    const target = ['/me', '/x'] as unknown as string;
    expect(isSafeRedirect(target)).toBe(false);
    expect(safeRedirect(target, '/fallback')).toBe('/fallback');
  });

  it('never leaves the site, whatever the input', () => {
    // Every string of 1 to 4 of these tokens after a leading "/":
    // 14 + 14² + 14³ + 14⁴ = 41,370 inputs.
    const tokens = [
      '/',
      '\\',
      '.',
      '..',
      '%2e',
      '%2f',
      '%5c',
      '\t',
      '\n',
      '@',
      ':',
      '?',
      '#',
      'evil.com',
    ];
    const site = 'https://www.d3creator.com';
    const escapes: string[] = [];
    let tails = [''];
    for (let length = 1; length <= 4; length++) {
      tails = tails.flatMap((tail) => tokens.map((token) => tail + token));
      for (const tail of tails) {
        const target = `/${tail}`;
        let origin: string | undefined;
        try {
          origin = new URL(safeRedirect(target, '/me'), site).origin;
        } catch {
          // A result that does not even parse is a miss too.
        }
        if (origin !== site) escapes.push(target);
      }
    }
    expect({ escapes: escapes.length, first: escapes.slice(0, 10) }).toEqual({
      escapes: 0,
      first: [],
    });
  });
});
