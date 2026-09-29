/**
 * The gate on the cron routes (and the admin routes they share a secret
 * with): `Authorization: Bearer ${CRON_SECRET}`, compared in constant time.
 * Vercel Cron sends that header itself once CRON_SECRET is set on the
 * project. Server-only.
 */

import { timingSafeEqual } from 'node:crypto';

import { NextResponse } from 'next/server';

/** Null when the caller holds the secret; else the response to send back. */
export function assertCronAuth(request: Request): Response | null {
  const expected = process.env.CRON_SECRET;
  if (!expected) {
    // Be loud — never let a misconfigured prod silently accept anonymous traffic.
    console.error('[cron] CRON_SECRET not set — cron auth will fail');
    return NextResponse.json(
      {
        error:
          'CRON_SECRET not configured on the server — add it to Vercel project env vars',
      },
      { status: 500 },
    );
  }
  const auth = request.headers.get('authorization') || '';
  const expectedFull = `Bearer ${expected}`;
  // Length check first so timingSafeEqual doesn't throw on mismatched buffers.
  // The length-mismatch path leaks only "wrong length", not which character —
  // an acceptable oracle for a high-entropy random secret.
  if (
    auth.length !== expectedFull.length ||
    !timingSafeEqual(
      Buffer.from(auth, 'utf8'),
      Buffer.from(expectedFull, 'utf8'),
    )
  ) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  return null;
}
