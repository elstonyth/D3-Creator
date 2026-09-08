'use server';

import { localizeAdminError } from '../localize-error';
import { getI18n } from '@gitroom/frontend/lib/i18n-server';
import { revalidatePath } from 'next/cache';
import { getSupabaseAdmin } from '@d3/database';
import { requireAdmin, getAuthContext } from '@gitroom/frontend/lib/auth';
import { isUuid } from '@gitroom/frontend/lib/ids';

const ROLES = ['admin', 'creator', 'member', 'none'] as const;
type Role = (typeof ROLES)[number];

export interface RoleResult {
  ok: boolean;
  message: string;
}

export async function setUserRole(
  userId: string,
  role: string,
): Promise<RoleResult> {
  const { t, locale } = await getI18n();
  try {
    await requireAdmin();
    if (!isUuid(userId)) return { ok: false, message: t('Invalid user id.') };
    if (!ROLES.includes(role as Role))
      return { ok: false, message: t('Invalid role.') };

    // Prevent an admin from demoting themselves (and locking themselves out).
    const me = await getAuthContext();
    if (!me) return { ok: false, message: t('Session expired.') };
    if (me.userId === userId && role !== 'admin') {
      return {
        ok: false,
        message: t('You cannot change your own admin role.'),
      };
    }

    const admin = getSupabaseAdmin();
    const { data, error } = await admin
      .from('user_role')
      .update({ role })
      .eq('user_id', userId)
      .select('user_id');
    if (error)
      return {
        ok: false,
        message: localizeAdminError(error.message, locale, t),
      };
    // No row for this user_id — report failure instead of a phantom success.
    if (!data || data.length === 0)
      return { ok: false, message: t('No matching user to update.') };
    revalidatePath('/admin/users');
    return { ok: true, message: t('Role updated.') };
  } catch (e) {
    return {
      ok: false,
      message:
        e instanceof Error
          ? localizeAdminError(e.message, locale, t)
          : t('Unexpected error'),
    };
  }
}
