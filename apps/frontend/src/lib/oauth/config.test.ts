/** @jest-environment node */
import {
  metaRedirectUri,
  tiktokRedirectUri,
  requireOauthEncKey,
  metaAppId,
  metaAppSecret,
} from './config';

describe('oauth config', () => {
  it('builds redirect URIs from SITE_URL', () => {
    expect(metaRedirectUri()).toBe(
      'https://www.d3creator.com/api/oauth/meta/callback',
    );
    expect(tiktokRedirectUri()).toBe(
      'https://www.d3creator.com/api/oauth/tiktok/callback',
    );
  });

  it('accepts a 32-byte key', () => {
    process.env.OAUTH_ENC_KEY = Buffer.alloc(32, 1).toString('base64');
    expect(() => requireOauthEncKey()).not.toThrow();
  });

  it('rejects a short key', () => {
    process.env.OAUTH_ENC_KEY = Buffer.alloc(8, 1).toString('base64');
    expect(() => requireOauthEncKey()).toThrow(/32 bytes/);
  });

  it('trims stray whitespace from META_APP_ID / SECRET', () => {
    // Reproduces the prod bug: a leading tab in the env value put %09 into the
    // OAuth client_id, so Facebook re-prompted login.
    process.env.META_APP_ID = '\t1487337389742304';
    process.env.META_APP_SECRET = '  s3cret\n';
    expect(metaAppId()).toBe('1487337389742304');
    expect(metaAppSecret()).toBe('s3cret');
  });

  it('treats whitespace-only credentials as unset', () => {
    process.env.META_APP_ID = '   ';
    expect(() => metaAppId()).toThrow(/not set/);
  });
});
