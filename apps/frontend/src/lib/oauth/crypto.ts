// apps/frontend/src/lib/oauth/crypto.ts
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

const ALGO = 'aes-256-gcm';
const IV_BYTES = 12;

function getKey(): Buffer {
  const b64 = process.env.OAUTH_ENC_KEY;
  if (!b64) throw new Error('OAUTH_ENC_KEY is not set');
  const key = Buffer.from(b64, 'base64');
  if (key.length !== 32) {
    throw new Error(`OAUTH_ENC_KEY must decode to 32 bytes, got ${key.length}`);
  }
  return key;
}

export interface EncryptedBlob {
  ct: string; // base64 ciphertext
  iv: string; // base64 iv
  tag: string; // base64 GCM auth tag
}

export function encryptToken(plaintext: string): EncryptedBlob {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGO, getKey(), iv);
  const ct = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  return {
    ct: ct.toString('base64'),
    iv: iv.toString('base64'),
    tag: cipher.getAuthTag().toString('base64'),
  };
}

export function decryptToken(blob: EncryptedBlob): string {
  const decipher = createDecipheriv(
    ALGO,
    getKey(),
    Buffer.from(blob.iv, 'base64'),
  );
  decipher.setAuthTag(Buffer.from(blob.tag, 'base64'));
  const pt = Buffer.concat([
    decipher.update(Buffer.from(blob.ct, 'base64')),
    decipher.final(),
  ]);
  return pt.toString('utf8');
}
