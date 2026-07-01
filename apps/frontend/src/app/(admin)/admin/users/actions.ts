'use server';

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
  try {
    await requireAdmin();
    if (!isUuid(userId)) return { ok: false, message: 'Invalid user id.' };
    if (!ROLES.includes(role as Role))
      return { ok: false, message: 'Invalid role.' };

    // Prevent an admin from demoting themselves (and locking themselves out).
    const me = await getAuthContext();
    if (!me) return { ok: false, message: 'Session expired.' };
    if (me.userId === userId && role !== 'admin') {
      return { ok: false, message: 'You cannot change your own admin role.' };
    }

    const admin = getSupabaseAdmin();
    const { data, error } = await admin
      .from('user_role')
      .update({ role })
      .eq('user_id', userId)
      .select('user_id');
    if (error) return { ok: false, message: error.message };
    // No row for this user_id — report failure instead of a phantom success.
    if (!data || data.length === 0)
      return { ok: false, message: 'No matching user to update.' };
    revalidatePath('/admin/users');
    return { ok: true, message: 'Role updated.' };
  } catch (e) {
    return {
      ok: false,
      message: e instanceof Error ? e.message : 'Unexpected error',
    };
  }
}
