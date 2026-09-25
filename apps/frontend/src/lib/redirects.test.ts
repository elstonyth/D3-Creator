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
});
