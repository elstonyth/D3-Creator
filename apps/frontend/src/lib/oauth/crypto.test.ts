/** @jest-environment node */
import { encryptToken, decryptToken } from './crypto';

const KEY = Buffer.alloc(32, 7).toString('base64');

describe('oauth crypto', () => {
  const prevKey = process.env.OAUTH_ENC_KEY;
  beforeEach(() => {
    process.env.OAUTH_ENC_KEY = KEY;
  });
  afterEach(() => {
    if (prevKey === undefined) delete process.env.OAUTH_ENC_KEY;
    else process.env.OAUTH_ENC_KEY = prevKey;
  });

  it('round-trips a token', () => {
    const blob = encryptToken('secret-token');
    expect(decryptToken(blob)).toBe('secret-token');
  });

  it('uses a fresh iv per call', () => {
    expect(encryptToken('x').iv).not.toBe(encryptToken('x').iv);
  });

  it('rejects a tampered auth tag', () => {
    const blob = encryptToken('secret');
    const bad = { ...blob, tag: Buffer.alloc(16, 0).toString('base64') };
    expect(() => decryptToken(bad)).toThrow();
  });

  it('throws when the key is the wrong length', () => {
    process.env.OAUTH_ENC_KEY = Buffer.alloc(16, 1).toString('base64');
    expect(() => encryptToken('x')).toThrow(/32 bytes/);
  });
});
