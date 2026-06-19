/** @jest-environment node */
import { getValidToken } from './tokens';
import { encryptToken } from './crypto';

const KEY = Buffer.alloc(32, 5).toString('base64');
beforeEach(() => {
  process.env.OAUTH_ENC_KEY = KEY;
});

function conn(over: Partial<Record<string, string>> = {}) {
  const b = encryptToken('PAGE_TOKEN_123');
  return {
    id: 'c1',
    platform: 'instagram',
    status: 'active',
    access_ct: b.ct,
    access_iv: b.iv,
    access_tag: b.tag,
    ...over,
  };
}

describe('getValidToken', () => {
  it('returns the decrypted page token for an active connection', () => {
    expect(getValidToken(conn())).toBe('PAGE_TOKEN_123');
  });
  it('throws for a revoked connection', () => {
    expect(() => getValidToken(conn({ status: 'revoked' }))).toThrow(
      /not active/,
    );
  });
  it('throws when the token blob was wiped', () => {
    expect(() => getValidToken(conn({ access_ct: '' }))).toThrow(/not active/);
  });
});
