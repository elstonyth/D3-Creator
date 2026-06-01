'use server';

/**
 * Per-creator editor actions. Same conventions as profiles/actions.ts: re-check
 * admin, validate ids, service-role writes, return {ok,message} (never throw),
 * revalidatePath. Ownership/URL logic reuses @d3/database helpers.
 */

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { randomBytes } from 'node:crypto';
import {
  getSupabaseAdmin,
  detectPlatform,
  resolveShortLink,
  validateProfileUrl,
  findOrCreateProfile,
  addProfileClaim,
} from '@d3/database';
import { requireAdmin } from '@gitroom/frontend/lib/auth';
import { isUuid } from '@gitroom/frontend/lib/ids';
import { validateDisplayName, validatePassword } from '@gitroom/frontend/lib/account-validation';

export interface ActionResult {
  ok: boolean;
  message: string;
}
export interface PasswordResetResult extends ActionResult {
  credentials?: { email: string; password: string };
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Unexpected error';
}

function revalidateCreator(creatorId: string) {
  revalidatePath(`/admin/creators/${creatorId}`);
  revalidatePath('/admin/profiles');
  revalidatePath('/admin');
}

/** crypto-strong, login-friendly throwaway password (passes validatePassword). */
function generatePassword(): string {
  return randomBytes(12).toString('base64url'); // ~16 chars, < 72 bytes
}

export async function renameCreator(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  try {
    await requireAdmin();
    const creatorId = String(formData.get('creator_id') ?? '');
    if (!isUuid(creatorId)) return { ok: false, message: 'Invalid creator id.' };
    const nameRes = validateDisplayName(String(formData.get('display_name') ?? ''));
    if (!nameRes.ok) return { ok: false, message: nameRes.error };

    const admin = getSupabaseAdmin();
    const { error } = await admin.from('creator').update({ display_name: nameRes.value }).eq('id', creatorId);
    if (error) {
      console.error('[admin/renameCreator]', error);
      return { ok: false, message: 'Could not rename the creator.' };
    }
    revalidateCreator(creatorId);
    return { ok: true, message: 'Renamed.' };
  } catch (error: unknown) {
    return { ok: false, message: getErrorMessage(error) };
  }
}

export async function addCreatorUrl(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  try {
    await requireAdmin();
    const creatorId = String(formData.get('creator_id') ?? '');
    if (!isUuid(creatorId)) return { ok: false, message: 'Invalid creator id.' };

    const resolved = await resolveShortLink(String(formData.get('url') ?? ''));
    const platform = detectPlatform(resolved);
    if (!platform) return { ok: false, message: 'Unrecognized platform URL.' };

    const admin = getSupabaseAdmin();
    const profileRes = await findOrCreateProfile({
      platform,
      profile_url: resolved,
      fallback_creator_id: creatorId,
    });
    if (profileRes.ok !== true) return { ok: false, message: profileRes.error };

    // The URL already existed under a DIFFERENT creator — don't steal it.
    if (!profileRes.value.created && profileRes.value.profile.creator_id !== creatorId) {
      return { ok: false, message: 'That profile is already tracked under another creator.' };
    }

    // Owner claim attaches to the creator's login (the first creator_link user).
    const link = await admin
      .from('creator_link')
      .select('user_id')
      .eq('creator_id', creatorId)
      .order('user_id', { ascending: true })
      .limit(1)
      .maybeSingle();
    if (link.data?.user_id) {
      const claimRes = await addProfileClaim({
        user_id: link.data.user_id,
        profile_id: profileRes.value.profile.id,
        claim_kind: 'owner',
        claimed_via: 'admin_assigned',
      });
      if (claimRes.ok !== true) {
        return { ok: false, message: `Profile saved, but the owner claim failed: ${claimRes.error}` };
      }
    }
    revalidateCreator(creatorId);
    return {
      ok: true,
      message: profileRes.value.created ? `Added ${platform} profile.` : `Linked existing ${platform} profile.`,
    };
  } catch (error: unknown) {
    return { ok: false, message: getErrorMessage(error) };
  }
}

export async function editCreatorUrl(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  try {
    await requireAdmin();
    const creatorId = String(formData.get('creator_id') ?? '');
    const profileId = String(formData.get('profile_id') ?? '');
    if (!isUuid(creatorId) || !isUuid(profileId)) return { ok: false, message: 'Invalid id.' };

    const admin = getSupabaseAdmin();
    const existing = await admin
      .from('profile')
      .select('platform, creator_id')
      .eq('id', profileId)
      .maybeSingle();
    if (existing.error || !existing.data || existing.data.creator_id !== creatorId) {
      return { ok: false, message: 'Profile not found for this creator.' };
    }

    const resolved = await resolveShortLink(String(formData.get('url') ?? ''));
    const platform = detectPlatform(resolved);
    if (!platform) return { ok: false, message: 'Unrecognized platform URL.' };
    if (platform !== existing.data.platform) {
      return { ok: false, message: `Different platform — remove this URL and add the new one.` };
    }
    const v = validateProfileUrl(platform, resolved);
    if (v.ok !== true) return { ok: false, message: v.error };

    const { error } = await admin
      .from('profile')
      .update({ profile_url: v.normalizedUrl, handle: v.handle, scrape_status: 'pending' })
      .eq('id', profileId);
    if (error) {
      console.error('[admin/editCreatorUrl]', error);
      return {
        ok: false,
        message: error.code === '23505' ? 'That profile already exists.' : 'Could not update the URL.',
      };
    }
    revalidateCreator(creatorId);
    return { ok: true, message: 'URL updated.' };
  } catch (error: unknown) {
    return { ok: false, message: getErrorMessage(error) };
  }
}

export async function removeCreatorUrl(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  try {
    await requireAdmin();
    const creatorId = String(formData.get('creator_id') ?? '');
    const profileId = String(formData.get('profile_id') ?? '');
    if (!isUuid(creatorId) || !isUuid(profileId)) return { ok: false, message: 'Invalid id.' };

    const admin = getSupabaseAdmin();
    const prof = await admin.from('profile').select('creator_id').eq('id', profileId).maybeSingle();
    if (prof.error || !prof.data || prof.data.creator_id !== creatorId) {
      return { ok: false, message: 'Profile not found for this creator.' };
    }
    const { error } = await admin.from('profile').delete().eq('id', profileId);
    if (error) {
      console.error('[admin/removeCreatorUrl]', error);
      return { ok: false, message: 'Could not remove the URL.' };
    }
    revalidateCreator(creatorId);
    return { ok: true, message: 'URL removed.' };
  } catch (error: unknown) {
    return { ok: false, message: getErrorMessage(error) };
  }
}

export async function resetCreatorPassword(
  _prev: PasswordResetResult | null,
  formData: FormData,
): Promise<PasswordResetResult> {
  try {
    await requireAdmin();
    const creatorId = String(formData.get('creator_id') ?? '');
    const userId = String(formData.get('user_id') ?? '');
    if (!isUuid(creatorId) || !isUuid(userId)) return { ok: false, message: 'Invalid id.' };

    const admin = getSupabaseAdmin();
    const link = await admin
      .from('creator_link')
      .select('user_id')
      .eq('user_id', userId)
      .eq('creator_id', creatorId)
      .maybeSingle();
    if (link.error || !link.data) {
      return { ok: false, message: 'That login is not linked to this creator.' };
    }

    const typed = String(formData.get('password') ?? '');
    const password = typed.length ? typed : generatePassword();
    const pwRes = validatePassword(password);
    if (!pwRes.ok) return { ok: false, message: pwRes.error };

    const upd = await admin.auth.admin.updateUserById(userId, { password: pwRes.value });
    if (upd.error || !upd.data.user) {
      console.error('[admin/resetCreatorPassword]', upd.error);
      return { ok: false, message: 'Could not reset the password.' };
    }
    revalidateCreator(creatorId);
    return {
      ok: true,
      message: 'Password reset.',
      credentials: { email: upd.data.user.email ?? '', password: pwRes.value },
    };
  } catch (error: unknown) {
    return { ok: false, message: getErrorMessage(error) };
  }
}

export async function deleteCreator(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const creatorId = String(formData.get('creator_id') ?? '');
  let done = false;
  try {
    await requireAdmin();
    if (!isUuid(creatorId)) return { ok: false, message: 'Invalid creator id.' };

    const admin = getSupabaseAdmin();
    // Delete linked logins first (cascades user_role + creator_link), then the
    // creator (cascades profiles → claims/snapshots/posts).
    const links = await admin.from('creator_link').select('user_id').eq('creator_id', creatorId);
    for (const l of (links.data ?? []) as { user_id: string }[]) {
      await admin.auth.admin.deleteUser(l.user_id).catch(() => {});
    }
    const del = await admin.from('creator').delete().eq('id', creatorId);
    if (del.error) {
      console.error('[admin/deleteCreator]', del.error);
      return { ok: false, message: 'Could not delete the creator.' };
    }
    revalidatePath('/admin/profiles');
    revalidatePath('/admin');
    done = true;
  } catch (error: unknown) {
    return { ok: false, message: getErrorMessage(error) };
  }
  // redirect() throws NEXT_REDIRECT — keep it OUTSIDE the try so it isn't caught.
  if (done) redirect('/admin/profiles');
  return { ok: true, message: 'Deleted.' };
}
