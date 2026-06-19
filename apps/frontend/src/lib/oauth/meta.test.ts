/** @jest-environment node */
import { createHmac } from 'node:crypto';
import { verifySignedRequest } from './meta';

const SECRET = 'app-secret-xyz';

function makeSigned(payloadObj: object, secret = SECRET): string {
  const payload = Buffer.from(JSON.stringify(payloadObj), 'utf8').toString(
    'base64url',
  );
  const sig = createHmac('sha256', secret).update(payload).digest('base64url');
  return `${sig}.${payload}`;
}

describe('verifySignedRequest', () => {
  it('accepts a correctly signed request', () => {
    const signed = makeSigned({ user_id: '42', algorithm: 'HMAC-SHA256' });
    expect(verifySignedRequest(signed, SECRET)?.user_id).toBe('42');
  });

  it('rejects a bad signature', () => {
    const signed = makeSigned({ user_id: '42' }, 'wrong-secret');
    expect(verifySignedRequest(signed, SECRET)).toBeNull();
  });

  it('rejects malformed input', () => {
    expect(verifySignedRequest('garbage', SECRET)).toBeNull();
  });
});
