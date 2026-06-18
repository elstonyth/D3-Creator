/** @jest-environment node */
import { signState, verifyState, makePkce } from './state';
import { createHash } from 'node:crypto';

beforeEach(() => {
  process.env.OAUTH_ENC_KEY = Buffer.alloc(32, 3).toString('base64');
});

describe('oauth state', () => {
  it('round-trips uid', () => {
    const s = signState('user-123');
    expect(verifyState(s)?.uid).toBe('user-123');
  });

  it('rejects a tampered payload', () => {
    const s = signState('user-123');
    const [, sig] = s.split('.');
    const forged = Buffer.from(
      JSON.stringify({ uid: 'attacker', nonce: 'x', exp: 9_999_999_999 }),
      'utf8',
    ).toString('base64url');
    expect(verifyState(`${forged}.${sig}`)).toBeNull();
  });

  it('rejects an expired state', () => {
    const s = signState('user-123', 600);
    expect(verifyState(s, 9_999_999_999)).toBeNull();
  });

  it('PKCE challenge is the s256 of the verifier', () => {
    const { verifier, challenge } = makePkce();
    expect(createHash('sha256').update(verifier).digest('base64url')).toBe(
      challenge,
    );
  });
});
