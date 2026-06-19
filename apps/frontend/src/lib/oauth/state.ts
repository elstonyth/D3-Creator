// apps/frontend/src/lib/oauth/state.ts
import {
  createHmac,
  createHash,
  hkdfSync,
  randomBytes,
  timingSafeEqual,
} from 'node:crypto';

function stateKey(): Buffer {
  const b64 = process.env.OAUTH_ENC_KEY;
  if (!b64) throw new Error('OAUTH_ENC_KEY is not set');
  const ikm = Buffer.from(b64, 'base64');
  // Distinct derived key so the state HMAC key != the token encryption key.
  return Buffer.from(
    hkdfSync('sha256', ikm, Buffer.alloc(0), 'd3-oauth-state', 32),
  );
}

export interface StatePayload {
  uid: string;
  nonce: string;
  exp: number; // unix seconds
}

export function signState(uid: string, ttlSeconds = 600): string {
  const payload: StatePayload = {
    uid,
    nonce: randomBytes(8).toString('hex'),
    exp: Math.floor(Date.now() / 1000) + ttlSeconds,
  };
  const body = Buffer.from(JSON.stringify(payload), 'utf8').toString(
    'base64url',
  );
  const sig = createHmac('sha256', stateKey()).update(body).digest('base64url');
  return `${body}.${sig}`;
}

export function verifyState(
  state: string,
  nowSeconds = Math.floor(Date.now() / 1000),
): StatePayload | null {
  const [body, sig] = state.split('.');
  if (!body || !sig) return null;
  const expected = createHmac('sha256', stateKey())
    .update(body)
    .digest('base64url');
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  let payload: StatePayload;
  try {
    payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
  } catch {
    return null;
  }
  if (typeof payload.exp !== 'number' || payload.exp < nowSeconds) return null;
  return payload;
}

export function makePkce(): { verifier: string; challenge: string } {
  const verifier = randomBytes(48).toString('base64url'); // 64 url-safe chars
  const challenge = createHash('sha256').update(verifier).digest('base64url');
  return { verifier, challenge };
}
