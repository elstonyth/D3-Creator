// apps/frontend/src/app/(creator)/me/connections/actions.ts
'use server';

import { revalidatePath } from 'next/cache';
import { cookies } from 'next/headers';
import { getAuthContext } from '@gitroom/frontend/lib/auth';
import { isUuid } from '@gitroom/frontend/lib/ids';
import {
  encryptToken,
  decryptToken,
  type EncryptedBlob,
} from '@gitroom/frontend/lib/oauth/crypto';
import { listPagesAndIg } from '@gitroom/frontend/lib/oauth/meta';
import {
  ensureCreatorForUser,
  attachOwnedProfile,
  upsertOAuthConnection,
  revokeOAuthConnection,
} from '@d3/database';

export interface ActionResult {
  ok: boolean;
  message: string;
}

interface MetaStash {
  userToken: EncryptedBlob;
  userTokenExp: number | null;
  targets: Array<{
    pageId: string;
    pageName: string;
    igId: string | null;
    igUsername: string | null;
  }>;
}

async function readStash(): Promise<MetaStash | null> {
  const raw = (await cookies()).get('meta_pending')?.value;
  if (!raw) return null;
  try {
    return JSON.parse(Buffer.from(raw, 'base64').toString('utf8')) as MetaStash;
  } catch {
    return null;
  }
}

export async function finalizeMeta(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const auth = await getAuthContext();
  if (!auth || auth.role === 'admin')
    return { ok: false, message: 'Not authorized.' };

  const stash = await readStash();
  if (!stash)
    return { ok: false, message: 'Connection session expired — reconnect.' };

  const selectedPageIds = new Set(formData.getAll('pageId').map(String));
  if (selectedPageIds.size === 0)
    return { ok: false, message: 'Pick at least one account.' };

  const creator = await ensureCreatorForUser({ user_id: auth.userId });
  if (creator.ok !== true) return { ok: false, message: creator.error };

  // Re-fetch page tokens from the long-lived user token (not stored in the cookie).
  let live;
  try {
    const userToken = decryptToken(stash.userToken);
    live = await listPagesAndIg(userToken);
  } catch {
    (await cookies()).delete('meta_pending');
    return { ok: false, message: 'Meta fetch failed — reconnect.' };
  }
  const liveById = new Map(live.map((t) => [t.pageId, t]));

  let connected = 0;
  const accessExp = stash.userTokenExp
    ? new Date(stash.userTokenExp).toISOString()
    : null;

  for (const pageId of selectedPageIds) {
    const t = liveById.get(pageId);
    if (!t) continue;

    // Facebook Page connection (page access token).
    const fbProfile = await attachOwnedProfile({
      user_id: auth.userId,
      creator_id: creator.value.creator_id,
      platform: 'facebook',
      handle: t.pageName,
      external_account_id: t.pageId,
    });
    if (fbProfile.ok === true) {
      await upsertOAuthConnection({
        user_id: auth.userId,
        profile_id: fbProfile.value.profile_id,
        platform: 'facebook',
        external_account_id: t.pageId,
        account_name: t.pageName,
        scopes: 'pages_read_engagement',
        access: encryptToken(t.pageAccessToken),
        refresh: null,
        access_expires_at: accessExp,
        refresh_expires_at: null,
      });
      connected++;
    }

    // Linked Instagram business account (uses the same page token for insights).
    if (t.igId) {
      const igProfile = await attachOwnedProfile({
        user_id: auth.userId,
        creator_id: creator.value.creator_id,
        platform: 'instagram',
        handle: t.igUsername ?? t.igId,
        external_account_id: t.igId,
      });
      if (igProfile.ok === true) {
        await upsertOAuthConnection({
          user_id: auth.userId,
          profile_id: igProfile.value.profile_id,
          platform: 'instagram',
          external_account_id: t.igId,
          account_name: t.igUsername ?? t.igId,
          scopes: 'instagram_manage_insights',
          access: encryptToken(t.pageAccessToken),
          refresh: null,
          access_expires_at: accessExp,
          refresh_expires_at: null,
        });
        connected++;
      }
    }
  }

  (await cookies()).delete('meta_pending');
  revalidatePath('/me/connections');
  return connected > 0
    ? {
        ok: true,
        message: `Connected ${connected} account${connected === 1 ? '' : 's'}.`,
      }
    : { ok: false, message: 'Nothing connected.' };
}

export async function disconnect(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const auth = await getAuthContext();
  if (!auth || auth.role === 'admin')
    return { ok: false, message: 'Not authorized.' };
  const connectionId = String(formData.get('connection_id') ?? '');
  if (!isUuid(connectionId))
    return { ok: false, message: 'Invalid connection id.' };
  const res = await revokeOAuthConnection({
    user_id: auth.userId,
    connection_id: connectionId,
  });
  if (res.ok !== true) return { ok: false, message: res.error };
  revalidatePath('/me/connections');
  return { ok: true, message: 'Disconnected.' };
}
