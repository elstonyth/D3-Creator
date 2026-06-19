// apps/frontend/src/app/api/oauth/meta/data-deletion/route.ts
import { NextResponse, type NextRequest } from 'next/server';
import { randomBytes } from 'node:crypto';
import { verifySignedRequest } from '@gitroom/frontend/lib/oauth/meta';
import { metaAppSecret } from '@gitroom/frontend/lib/oauth/config';
import { SITE_URL } from '@gitroom/frontend/lib/site';

export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  const form = await request.formData();
  const signed = String(form.get('signed_request') ?? '');
  const data = verifySignedRequest(signed, metaAppSecret());
  if (!data)
    return NextResponse.json({ error: 'invalid_signature' }, { status: 400 });

  // Meta requires a JSON body with a status URL + tracking code.
  const code = randomBytes(8).toString('hex');
  return NextResponse.json({
    url: `${SITE_URL}/privacy?meta_deletion=${code}`,
    confirmation_code: code,
  });
}
