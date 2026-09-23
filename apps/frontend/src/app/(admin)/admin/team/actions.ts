'use server';

/**
 * Staff approvals. A staff login is only useful once it is linked to a
 * person on the work board, so approving does both — link (or create) the
 * person, then flip staff_pending to staff — and undoes the link if the flip
 * does not happen, so the two halves never disagree. A link left behind by an
 * approval that failed half-way is cleared on the next try, so approving
 * again always works.
 */

import { revalidatePath } from 'next/cache';
import { getSupabaseAdmin } from '@d3/database';
import { requireAdmin } from '@gitroom/frontend/lib/auth';
import { isUuid } from '@gitroom/frontend/lib/ids';
import { cleanTitle, type MemberKind } from '@gitroom/frontend/lib/tracker';

export interface TeamResult {
  ok: boolean;
  message?: string;
}

async function guarded(fn: () => Promise<TeamResult>): Promise<TeamResult> {
  try {
    await requireAdmin();
    const r = await fn();
    if (r.ok) revalidatePath('/admin/team');
    return r;
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : 'Failed.' };
  }
}

const NOT_WAITING = 'That account is not waiting for approval.';

export type ApproveTarget =
  | { memberId: string }
  | { name: string; kind: MemberKind };

export async function approveStaff(
  userId: string,
  target: ApproveTarget,
): Promise<TeamResult> {
  return guarded(async () => {
    if (!isUuid(userId)) return { ok: false, message: 'Invalid account.' };
    const admin = getSupabaseAdmin();
    const { data: row, error: roleReadErr } = await admin
      .from('user_role')
      .select('role')
      .eq('user_id', userId)
      .maybeSingle();
    if (roleReadErr) return { ok: false, message: roleReadErr.message };
    if (row?.role !== 'staff_pending')
      return { ok: false, message: NOT_WAITING };
    // Still waiting, so any person linked to this login is left over from an
    // attempt that failed after linking.
    const { error: staleErr } = await admin
      .from('tracker_member')
      .update({ user_id: null })
      .eq('user_id', userId);
    if (staleErr) return { ok: false, message: staleErr.message };

    let memberId: string;
    let created = false;
    if (target && 'memberId' in target) {
      if (!isUuid(target.memberId))
        return { ok: false, message: 'Invalid person.' };
      const { data, error } = await admin
        .from('tracker_member')
        .update({ user_id: userId })
        .eq('id', target.memberId)
        .is('user_id', null)
        .is('archived_at', null)
        .select('id');
      if (error) return { ok: false, message: error.message };
      if (!data || data.length === 0)
        return {
          ok: false,
          message:
            'That person already has a login, or is no longer on the board.',
        };
      memberId = target.memberId;
    } else {
      const name = cleanTitle(target?.name, 40);
      if (!name)
        return { ok: false, message: 'Name is required (max 40 chars).' };
      const kind = target.kind;
      if (kind !== 'handler' && kind !== 'editor')
        return { ok: false, message: 'Invalid person type.' };
      const { data: last } = await admin
        .from('tracker_member')
        .select('sort_order')
        .order('sort_order', { ascending: false })
        .limit(1)
        .maybeSingle();
      const { data, error } = await admin
        .from('tracker_member')
        .insert({
          name,
          kind,
          role: kind === 'editor' ? 'Editor' : 'Trader',
          user_id: userId,
          sort_order: (last?.sort_order ?? -1) + 1,
        })
        .select('id')
        .single();
      if (error) return { ok: false, message: error.message };
      memberId = data.id;
      created = true;
    }

    const { data: flipped, error: roleErr } = await admin
      .from('user_role')
      .update({ role: 'staff' })
      .eq('user_id', userId)
      .eq('role', 'staff_pending')
      .select('user_id');
    if (roleErr || !flipped || flipped.length === 0) {
      // Take the link back so the board never names a login that is not staff.
      const undo = created
        ? await admin.from('tracker_member').delete().eq('id', memberId)
        : await admin
            .from('tracker_member')
            .update({ user_id: null })
            .eq('id', memberId);
      // A link the undo could not take back is cleared by the next try.
      if (undo.error)
        return { ok: false, message: 'Could not finish approving. Try again.' };
      return { ok: false, message: roleErr?.message ?? NOT_WAITING };
    }
    return { ok: true };
  });
}

/** Turn a waiting signup away: the login stays, but reaches nothing. */
export async function rejectStaff(userId: string): Promise<TeamResult> {
  return guarded(async () => {
    if (!isUuid(userId)) return { ok: false, message: 'Invalid account.' };
    const { data, error } = await getSupabaseAdmin()
      .from('user_role')
      .update({ role: 'none' })
      .eq('user_id', userId)
      .eq('role', 'staff_pending')
      .select('user_id');
    if (error) return { ok: false, message: error.message };
    if (!data || data.length === 0) return { ok: false, message: NOT_WAITING };
    return { ok: true };
  });
}

/**
 * Take a person's login away (they stay on the board, with their history).
 * The login reaches nothing afterwards.
 */
export async function unlinkStaff(memberId: string): Promise<TeamResult> {
  return guarded(async () => {
    if (!isUuid(memberId)) return { ok: false, message: 'Invalid person.' };
    const admin = getSupabaseAdmin();
    const { data: person, error: readErr } = await admin
      .from('tracker_member')
      .select('user_id')
      .eq('id', memberId)
      .maybeSingle();
    if (readErr) return { ok: false, message: readErr.message };
    if (!person?.user_id)
      return { ok: false, message: 'That person has no login.' };
    const { error: roleErr } = await admin
      .from('user_role')
      .update({ role: 'none' })
      .eq('user_id', person.user_id)
      .in('role', ['staff', 'staff_pending']);
    if (roleErr) return { ok: false, message: roleErr.message };
    const { error } = await admin
      .from('tracker_member')
      .update({ user_id: null })
      .eq('id', memberId);
    return error ? { ok: false, message: error.message } : { ok: true };
  });
}
