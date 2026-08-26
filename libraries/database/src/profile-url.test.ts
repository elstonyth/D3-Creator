/**
 * Unit tests for profile URL validators.
 * Run with: npx jest --config libraries/database/jest.config.cjs
 *
 * These were written against node:test, back when the libraries/* layer had no
 * jest plumbing at all. It does now (this config plus libraries/scrapers'), and
 * snapshots.test.ts is already a jest suite — so staying on node:test only meant
 * jest matched the file, found no jest tests, and failed the suite while node's
 * own runner quietly passed 43 assertions that CI never looked at. Converted to
 * jest so one runner covers the whole library. Pure functions: no DB, no env,
 * no network.
 */

import { detectPlatform, validateProfileUrl } from './profile-url';

describe('detectPlatform', () => {
  it('detects instagram', () => {
    expect(detectPlatform('https://www.instagram.com/john')).toBe('instagram');
    expect(detectPlatform('https://instagram.com/jane/')).toBe('instagram');
  });
  it('detects tiktok', () => {
    expect(detectPlatform('https://www.tiktok.com/@user')).toBe('tiktok');
  });
  it('detects facebook', () => {
    expect(detectPlatform('https://facebook.com/page')).toBe('facebook');
    expect(detectPlatform('https://www.fb.com/page')).toBe('facebook');
  });
  it('detects rednote (xiaohongshu)', () => {
    expect(
      detectPlatform('https://www.xiaohongshu.com/user/profile/abc123'),
    ).toBe('rednote');
  });
  it('detects douyin', () => {
    expect(detectPlatform('https://www.douyin.com/user/MS4wLjA')).toBe(
      'douyin',
    );
  });
  it('returns null for unknown host', () => {
    expect(detectPlatform('https://twitter.com/user')).toBe(null);
    expect(detectPlatform('not a url')).toBe(null);
    expect(detectPlatform('')).toBe(null);
  });
});

describe('validateProfileUrl — instagram', () => {
  it('accepts profile root with @ and normalizes it away (dedupes with the @-less form)', () => {
    const r = validateProfileUrl(
      'instagram',
      'https://www.instagram.com/@john_ig',
    );
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.handle).toBe('john_ig');
      expect(r.normalizedUrl).toBe('https://www.instagram.com/john_ig');
    }
  });
  it('accepts profile root without @', () => {
    const r = validateProfileUrl(
      'instagram',
      'https://instagram.com/jane.smith/',
    );
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.handle).toBe('jane.smith');
  });
  it('rejects post URL', () => {
    const r = validateProfileUrl(
      'instagram',
      'https://www.instagram.com/p/ABC123/',
    );
    expect(r.ok).toBe(false);
  });
  it('rejects reel URL', () => {
    const r = validateProfileUrl(
      'instagram',
      'https://www.instagram.com/reel/XYZ/',
    );
    expect(r.ok).toBe(false);
  });
  it('rejects cross-platform paste (tiktok URL claimed as instagram)', () => {
    const r = validateProfileUrl('instagram', 'https://www.tiktok.com/@user');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/does not match platform instagram/);
  });
});

describe('validateProfileUrl — tiktok', () => {
  it('accepts @handle and KEEPS the @ (canonical on tiktok, unlike instagram)', () => {
    const r = validateProfileUrl('tiktok', 'https://www.tiktok.com/@dancer');
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.handle).toBe('dancer');
      // Every existing tiktok row is stored @-form — stripping it here would
      // break their dedupe under (platform, lower(profile_url)).
      expect(r.normalizedUrl).toBe('https://www.tiktok.com/@dancer');
    }
  });
  it('rejects video URL', () => {
    const r = validateProfileUrl(
      'tiktok',
      'https://www.tiktok.com/@dancer/video/12345',
    );
    expect(r.ok).toBe(false);
  });
});

describe('validateProfileUrl — facebook', () => {
  it('accepts vanity handle', () => {
    const r = validateProfileUrl('facebook', 'https://www.facebook.com/zuck');
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.handle).toBe('zuck');
  });
  it('accepts profile.php?id=', () => {
    const r = validateProfileUrl(
      'facebook',
      'https://www.facebook.com/profile.php?id=100012345',
    );
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.handle).toBe('100012345');
      expect(r.normalizedUrl).toBe(
        'https://www.facebook.com/profile.php?id=100012345',
      );
    }
  });
  it('rejects profile.php with non-numeric id', () => {
    const r = validateProfileUrl(
      'facebook',
      'https://www.facebook.com/profile.php?id=abc',
    );
    expect(r.ok).toBe(false);
  });
  it('rejects /share path', () => {
    const r = validateProfileUrl(
      'facebook',
      'https://www.facebook.com/share/p/abc',
    );
    expect(r.ok).toBe(false);
  });
});

describe('validateProfileUrl — rednote', () => {
  it('accepts /user/profile/<id>', () => {
    const r = validateProfileUrl(
      'rednote',
      'https://www.xiaohongshu.com/user/profile/5f8a2b3c4d5e6f7g8h9i0',
    );
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.handle).toBe('5f8a2b3c4d5e6f7g8h9i0');
  });
  it('rejects post URL', () => {
    const r = validateProfileUrl(
      'rednote',
      'https://www.xiaohongshu.com/explore/abc',
    );
    expect(r.ok).toBe(false);
  });
});

describe('validateProfileUrl — douyin', () => {
  it('accepts /user/<sec_uid>', () => {
    const r = validateProfileUrl(
      'douyin',
      'https://www.douyin.com/user/MS4wLjABAAAA_long-id-with-dashes',
    );
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.handle).toBe('MS4wLjABAAAA_long-id-with-dashes');
  });
});

describe('validateProfileUrl — edge cases', () => {
  it('rejects empty string', () => {
    const r = validateProfileUrl('instagram', '');
    expect(r.ok).toBe(false);
  });
  it('rejects whitespace-only', () => {
    const r = validateProfileUrl('instagram', '   ');
    expect(r.ok).toBe(false);
  });
  it('rejects malformed URL', () => {
    const r = validateProfileUrl('instagram', 'not-a-url');
    expect(r.ok).toBe(false);
  });
  it('rejects non-http protocol', () => {
    const r = validateProfileUrl('instagram', 'ftp://instagram.com/user');
    expect(r.ok).toBe(false);
  });
  it('strips trailing slash in normalizedUrl', () => {
    const r = validateProfileUrl(
      'instagram',
      'https://www.instagram.com/user/',
    );
    if (r.ok) expect(r.normalizedUrl.endsWith('/')).toBe(false);
  });
});

describe('validateProfileUrl — bare URLs (no scheme)', () => {
  const cases: Array<
    [Parameters<typeof validateProfileUrl>[0], string, string]
  > = [
    ['instagram', 'instagram.com/handle', 'handle'],
    ['instagram', 'www.instagram.com/handle', 'handle'],
    ['tiktok', 'www.tiktok.com/@handle', 'handle'],
    ['tiktok', 'tiktok.com/@handle', 'handle'],
    ['facebook', 'www.facebook.com/vanity', 'vanity'],
    ['facebook', 'facebook.com/profile.php?id=100012345', '100012345'],
    ['rednote', 'www.xiaohongshu.com/user/profile/64abc', '64abc'],
    ['douyin', 'www.douyin.com/user/MS4wLjABAAAA_x-y', 'MS4wLjABAAAA_x-y'],
  ];
  for (const [platform, url, handle] of cases) {
    it(`accepts bare ${url}`, () => {
      const r = validateProfileUrl(platform, url);
      expect(r.ok).toBe(true);
      if (r.ok) {
        expect(r.handle).toBe(handle);
        expect(r.normalizedUrl.startsWith('https://')).toBe(true);
      }
    });
  }
  it('detectPlatform also handles bare URLs', () => {
    expect(detectPlatform('instagram.com/x')).toBe('instagram');
    expect(detectPlatform('www.tiktok.com/@x')).toBe('tiktok');
  });
});

describe('validateProfileUrl — canonical host normalization', () => {
  it('collapses m./web./no-www to one canonical URL', () => {
    const variants = [
      'https://m.instagram.com/handle',
      'https://instagram.com/handle',
      'http://www.instagram.com/handle/',
      'instagram.com/handle',
    ];
    // Compared as a whole table rather than one expect() per iteration: jest's
    // expect() takes no per-assertion message the way node:assert did, so
    // folding the input variant into the compared value is what keeps a failure
    // naming the URL that broke.
    const got = variants.map((v) => {
      const r = validateProfileUrl('instagram', v);
      return [v, r.ok ? r.normalizedUrl : `REJECTED: ${r.error}`];
    });
    expect(got).toEqual(
      variants.map((v) => [v, 'https://www.instagram.com/handle']),
    );
  });
  it('canonicalizes facebook host (web./m./fb.com → www.facebook.com)', () => {
    const variants = [
      'https://web.facebook.com/vanity',
      'https://m.facebook.com/vanity',
      'https://fb.com/vanity',
    ];
    const got = variants.map((v) => {
      const r = validateProfileUrl('facebook', v);
      return [v, r.ok ? r.normalizedUrl : `REJECTED: ${r.error}`];
    });
    expect(got).toEqual(
      variants.map((v) => [v, 'https://www.facebook.com/vanity']),
    );
  });
});

describe('validateProfileUrl — facebook extra shapes', () => {
  it('accepts /people/Name/id and canonicalizes to profile.php?id=', () => {
    const r = validateProfileUrl(
      'facebook',
      'https://www.facebook.com/people/Some-Name/61555000111222/',
    );
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.handle).toBe('61555000111222');
      expect(r.normalizedUrl).toBe(
        'https://www.facebook.com/profile.php?id=61555000111222',
      );
    }
  });
  it('accepts a vanity URL with a sub-tab and drops the tab', () => {
    const tabs = ['about', 'reels_tab', 'photos'];
    const got = tabs.map((tab) => {
      const r = validateProfileUrl(
        'facebook',
        `https://www.facebook.com/vanity/${tab}`,
      );
      return [tab, r.ok ? r.normalizedUrl : `REJECTED: ${r.error}`];
    });
    expect(got).toEqual(
      tabs.map((tab) => [tab, 'https://www.facebook.com/vanity']),
    );
  });
  it('still rejects reserved sections (/watch, /groups)', () => {
    expect(
      validateProfileUrl('facebook', 'https://www.facebook.com/watch/').ok,
    ).toBe(false);
    expect(
      validateProfileUrl('facebook', 'https://www.facebook.com/groups/123').ok,
    ).toBe(false);
  });
});

describe('validateProfileUrl — short links rejected with a clear message', () => {
  const cases: Array<[Parameters<typeof validateProfileUrl>[0], string]> = [
    ['tiktok', 'https://vm.tiktok.com/ZMabc123/'],
    ['tiktok', 'https://vt.tiktok.com/ZMabc123/'],
    ['douyin', 'https://v.douyin.com/abc123/'],
    ['rednote', 'https://xhslink.com/a/abc123'],
  ];
  for (const [platform, url] of cases) {
    it(`rejects ${url} with guidance`, () => {
      const r = validateProfileUrl(platform, url);
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.error).toMatch(/short link/i);
    });
  }
});
