/** @jest-environment node */
import {
  metaRedirectUri,
  tiktokRedirectUri,
  requireOauthEncKey,
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
});
