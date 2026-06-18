// apps/frontend/src/app/api/oauth/meta/deauthorize/route.ts
import { NextResponse, type NextRequest } from 'next/server';
import { verifySignedRequest } from '@gitroom/frontend/lib/oauth/meta';
import { metaAppSecret } from '@gitroom/frontend/lib/oauth/config';

export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  const form = await request.formData();
  const signed = String(form.get('signed_request') ?? '');
  const data = verifySignedRequest(signed, metaAppSecret());
  if (!data)
    return NextResponse.json({ error: 'invalid_signature' }, { status: 400 });
  // Authentic Meta deauthorization. (User-driven token deletion is handled by
  // the Disconnect action; this endpoint acknowledges Meta's notification.)
  return NextResponse.json({ ok: true });
}
