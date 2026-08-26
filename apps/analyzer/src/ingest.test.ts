/**
 * Link ingest — the pure half. Platform detection is the part that decides
 * whether a paste is accepted at all, so it is the part with a test.
 *
 * The resolvers themselves are network calls and are verified by hand against
 * real roster URLs (see the note in `ingest.ts`); nothing here spends a credit.
 */

import { LINK_PLATFORMS, detectPlatform } from './ingest';

describe('detectPlatform', () => {
  it('recognises the canonical web URL for each supported platform', () => {
    expect(detectPlatform('https://www.tiktok.com/@a/video/123')).toBe(
      'tiktok',
    );
    expect(detectPlatform('https://www.douyin.com/video/123')).toBe('douyin');
    expect(detectPlatform('https://www.instagram.com/p/DcOM5UQOwPq/')).toBe(
      'instagram',
    );
    expect(detectPlatform('https://www.instagram.com/reel/DcOM5UQOwPq/')).toBe(
      'instagram',
    );
    expect(detectPlatform('https://www.xiaohongshu.com/explore/abc')).toBe(
      'rednote',
    );
    expect(detectPlatform('https://www.facebook.com/watch/?v=1')).toBe(
      'facebook',
    );
  });

  it('recognises the SHORT-link hosts the share sheet actually produces', () => {
    expect(detectPlatform('https://vm.tiktok.com/ZSAbCdEf/')).toBe('tiktok');
    expect(detectPlatform('https://vt.tiktok.com/ZSAbCdEf/')).toBe('tiktok');
    expect(detectPlatform('https://v.douyin.com/iAbCdEf/')).toBe('douyin');
    expect(detectPlatform('https://xhslink.com/a/AbCdEf')).toBe('rednote');
    expect(detectPlatform('https://fb.watch/abc123/')).toBe('facebook');
  });

  it('ignores www., query strings and tracking suffixes', () => {
    expect(
      detectPlatform('https://tiktok.com/@a/video/1?is_from_webapp=1'),
    ).toBe('tiktok');
    expect(detectPlatform('  https://www.TikTok.com/@a/video/1  ')).toBe(
      'tiktok',
    );
  });

  it('rejects anything else, including look-alike hosts', () => {
    expect(detectPlatform('https://example.com/cat.mp4')).toBeNull();
    expect(detectPlatform('https://youtube.com/watch?v=1')).toBeNull();
    // A suffix match must not accept an attacker-controlled parent domain.
    expect(detectPlatform('https://tiktok.com.evil.test/x')).toBeNull();
    expect(detectPlatform('https://nottiktok.com/x')).toBeNull();
  });

  it('rejects non-http schemes and malformed input', () => {
    expect(detectPlatform('file:///etc/passwd')).toBeNull();
    expect(detectPlatform('javascript:alert(1)')).toBeNull();
    expect(detectPlatform('not a url')).toBeNull();
    expect(detectPlatform('')).toBeNull();
  });

  it('LINK_PLATFORMS is the five the product talks about', () => {
    expect(LINK_PLATFORMS).toEqual([
      'tiktok',
      'douyin',
      'instagram',
      'rednote',
      'facebook',
    ]);
  });
});
