'use server';

/**
 * Admin creator-provisioning action. Mirrors profiles/actions.ts conventions:
 * re-check admin (defense-in-depth), service-role writes, return a result
 * object instead of throwing, revalidatePath.
 *
 * Flow: create the auth login (the handle_new_auth_user trigger assigns
 * role='creator' + an empty creator_link) -> ensureCreatorForUser binds the
 * creator row -> per URL: detectPlatform -> findOrCreateProfile (canonical,
 * validates internally) -> addProfileClaim (owner, admin_assigned).
 *
 * email_confirm:true so the creator can sign in immediately (login-free,
 * agency-provisioned). The auth user is never rolled back on a downstream URL
 * failure — the login is the valuable artifact; failures are reported per-URL.
 */

import { localizeAdminError } from './localize-error';
import { getI18n } from '@gitroom/frontend/lib/i18n-server';
import { revalidatePath } from 'next/cache';
import {
  getSupabaseAdmin,
  ensureCreatorForUser,
  findOrCreateProfile,
  addProfileClaim,
  detectPlatform,
  resolveShortLink,
} from '@d3/database';
import { requireAdmin } from '@gitroom/frontend/lib/auth';
import { normalizeProvisionUrls } from '@gitroom/frontend/lib/provision-plan';
import {
  validateEmail,
  validatePassword,
  validateDisplayName,
  MAX_PROVISION_URLS,
} from '@gitroom/frontend/lib/account-validation';

export interface UrlResult {
  url: string;
  platform?: string;
  status: 'created' | 'linked' | 'failed';
  detail?: string;
}

export interface ProvisionResult {
  ok: boolean;
  message: string;
  /** Echoed once on success so the admin can hand them to the creator. */
  credentials?: { email: string; password: string };
  urlResults?: UrlResult[];
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Unexpected error';
}

export async function createCreator(
  _prev: ProvisionResult | null,
  formData: FormData,
): Promise<ProvisionResult> {
  const { t, locale } = await getI18n();
  try {
    await requireAdmin();

    const emailRes = validateEmail(String(formData.get('email') ?? ''));
    if (!emailRes.ok)
      return {
        ok: false,
        message: localizeAdminError(emailRes.error, locale, t),
      };
    const email = emailRes.value;

    const passwordRes = validatePassword(
      String(formData.get('password') ?? ''),
    );
    if (!passwordRes.ok)
      return {
        ok: false,
        message: localizeAdminError(passwordRes.error, locale, t),
      };
    const password = passwordRes.value;

    const nameRes = validateDisplayName(
      String(formData.get('display_name') ?? ''),
    );
    if (!nameRes.ok)
      return {
        ok: false,
        message: localizeAdminError(nameRes.error, locale, t),
      };
    const displayName = nameRes.value;

    // Validate the URL list BEFORE creating any auth user — an over-cap
    // submission must not leave an orphaned login/creator behind.
    const urls = normalizeProvisionUrls(
      formData.getAll('url').map((v) => String(v)),
    );
    if (urls.length > MAX_PROVISION_URLS) {
      return {
        ok: false,
        message: t('Too many URLs — provide at most {value1}.', {
          value1: MAX_PROVISION_URLS,
        }),
      };
    }

    const admin = getSupabaseAdmin();

    // 1. Auth login. Trigger assigns role='member' + empty creator_link; explicit update below promotes to 'creator'.
    const created = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { display_name: displayName },
    });
    if (created.error || !created.data.user) {
      return {
        ok: false,
        message: localizeAdminError(
          created.error?.message ?? 'Could not create the login.',
          locale,
          t,
        ),
      };
    }
    const userId = created.data.user.id;

    // Trigger now defaults new logins to 'member'; provisioned accounts are creators.
    const roleSet = await admin
      .from('user_role')
      .update({ role: 'creator' })
      .eq('user_id', userId);
    if (roleSet.error) {
      // Roll back the just-created login: a failed role assignment would leave
      // an orphaned 'member' account that also blocks re-provisioning (email is
      // taken). Only the bare login exists here — nothing valuable to keep yet.
      const cleanup = await admin.auth.admin.deleteUser(userId);
      if (cleanup.error) {
        console.error(
          '[admin/createCreator] orphan cleanup failed',
          userId,
          cleanup.error,
        );
      }
      return {
        ok: false,
        message: cleanup.error
          ? t(
              'Role assignment failed ({value1}); the partial login may remain — check /admin/users.',
              { value1: localizeAdminError(roleSet.error.message, locale, t) },
            )
          : t('Could not assign the creator role ({value1}). Please retry.', {
              value1: localizeAdminError(roleSet.error.message, locale, t),
            }),
      };
    }

    // 2. Create + bind the creator row.
    const creatorRes = await ensureCreatorForUser({
      user_id: userId,
      display_name: displayName,
    });
    if (creatorRes.ok !== true) {
      return {
        ok: false,
        message: t(
          'Login created, but linking the creator failed: {value1}. Add profiles via /admin/profiles or retry.',
          { value1: localizeAdminError(creatorRes.error, locale, t) },
        ),
        credentials: { email, password },
      };
    }
    const creatorId = creatorRes.value.creator_id;

    // 3. Assign social URLs — owner claims, admin-initiated.
    const urlResults: UrlResult[] = [];
    for (const rawUrl of urls) {
      const url = await resolveShortLink(rawUrl);
      const platform = detectPlatform(url);
      if (!platform) {
        urlResults.push({
          url,
          status: 'failed',
          detail: t('Unrecognized platform URL.'),
        });
        continue;
      }
      const profileRes = await findOrCreateProfile({
        platform,
        profile_url: url,
        fallback_creator_id: creatorId,
      });
      if (profileRes.ok !== true) {
        urlResults.push({
          url,
          platform,
          status: 'failed',
          detail: localizeAdminError(profileRes.error, locale, t),
        });
        continue;
      }
      const claimRes = await addProfileClaim({
        user_id: userId,
        profile_id: profileRes.value.profile.id,
        claim_kind: 'owner',
        claimed_via: 'admin_assigned',
      });
      if (claimRes.ok !== true) {
        urlResults.push({
          url,
          platform,
          status: 'failed',
          detail: localizeAdminError(claimRes.error, locale, t),
        });
        continue;
      }
      urlResults.push({
        url,
        platform,
        status: profileRes.value.created ? 'created' : 'linked',
      });
    }

    revalidatePath('/admin');

    const failures = urlResults.filter((r) => r.status === 'failed').length;
    const message =
      failures === 0
        ? t('Created {name}.', { name: displayName })
        : t(
            failures === 1
              ? 'Created {name} — {count} URL need attention.'
              : 'Created {name} — {count} URLs need attention.',
            { name: displayName, count: failures },
          );
    return { ok: true, message, credentials: { email, password }, urlResults };
  } catch (error: unknown) {
    return {
      ok: false,
      message: localizeAdminError(getErrorMessage(error), locale, t),
    };
  }
}
