'use server';

/**
 * Staff approvals. A staff login is only useful once it is linked to a
 * person on the work board. Approving flips staff_pending to staff first, as
 * a conditional write, so of two approvals of one signup (two tabs, two
 * admins) exactly one goes on; then it links an existing person or creates
 * one. tracker_member.user_id is unique, so two links for one login can't
 * both land either.
 *
 * "Waiting" is a staff_pending login, or a staff login linked to nobody (an
 * approval whose link step failed). The Team page lists both, and both can
 * be approved or turned away, so no half-done approval is ever stuck.
 *
 * The admin also sets each person's job and removes people who left. The
 * shoots and videos themselves are staff-only; the admin just looks.
 */

import { revalidatePath } from 'next/cache';
import { getSupabaseAdmin } from '@d3/database';
import { requireAdmin } from '@gitroom/frontend/lib/auth';
import { isUuid } from '@gitroom/frontend/lib/ids';
import {
  cleanTitle,
  MEMBER_KINDS,
  type MemberKind,
} from '@gitroom/frontend/lib/tracker';

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

/** The login's role if it is waiting (see above), else null. */
async function waiting(
  userId: string,
): Promise<'staff_pending' | 'staff' | null> {
  const admin = getSupabaseAdmin();
  const [roleRes, linkRes] = await Promise.all([
    admin.from('user_role').select('role').eq('user_id', userId).maybeSingle(),
    admin.from('tracker_member').select('id').eq('user_id', userId).limit(1),
  ]);
  if (roleRes.error) throw new Error(roleRes.error.message);
  if (linkRes.error) throw new Error(linkRes.error.message);
  const role = roleRes.data?.role;
  if (role === 'staff_pending') return role;
  if (role === 'staff' && (linkRes.data ?? []).length === 0) return role;
  return null;
}

/** Link the login to someone already on the board, or to a new person. */
async function link(
  userId: string,
  person: { memberId: string } | { name: string; kind: MemberKind },
): Promise<TeamResult> {
  const admin = getSupabaseAdmin();
  if ('memberId' in person) {
    const { data, error } = await admin
      .from('tracker_member')
      .update({ user_id: userId })
      .eq('id', person.memberId)
      .is('user_id', null)
      .is('archived_at', null)
      .select('id');
    if (error) return { ok: false, message: linkError(error) };
    if (!data || data.length === 0)
      return {
        ok: false,
        message:
          'That person already has a login, or is no longer on the board.',
      };
    return { ok: true };
  }
  const { data: last } = await admin
    .from('tracker_member')
    .select('sort_order')
    .order('sort_order', { ascending: false })
    .limit(1)
    .maybeSingle();
  const { error } = await admin.from('tracker_member').insert({
    name: person.name,
    kind: person.kind,
    role: person.kind === 'editor' ? 'Editor' : 'Trader',
    user_id: userId,
    sort_order: (last?.sort_order ?? -1) + 1,
  });
  return error ? { ok: false, message: linkError(error) } : { ok: true };
}

// A second approval racing the first loses on the unique login column.
const linkError = (e: { code?: string; message: string }) =>
  e.code === '23505' ? 'That login is already linked to someone.' : e.message;

export async function approveStaff(
  userId: string,
  target: ApproveTarget,
): Promise<TeamResult> {
  return guarded(async () => {
    if (!isUuid(userId)) return { ok: false, message: 'Invalid account.' };
    // What the admin chose is checked before anything is written.
    let person: { memberId: string } | { name: string; kind: MemberKind };
    if (target && 'memberId' in target) {
      if (!isUuid(target.memberId))
        return { ok: false, message: 'Invalid person.' };
      person = { memberId: target.memberId };
    } else {
      const name = cleanTitle(target?.name, 40);
      if (!name)
        return { ok: false, message: 'Name is required (max 40 chars).' };
      const kind = target?.kind;
      if (!kind || !MEMBER_KINDS.includes(kind))
        return { ok: false, message: 'Invalid person type.' };
      person = { name, kind };
    }

    const admin = getSupabaseAdmin();
    // Only an address its owner confirmed: otherwise anyone could sign up
    // with a colleague's email and name and be approved as them.
    const { data: account, error: accountErr } =
      await admin.auth.admin.getUserById(userId);
    if (accountErr) return { ok: false, message: accountErr.message };
    if (!account.user?.email_confirmed_at)
      return { ok: false, message: 'They have not confirmed their email yet.' };

    const was = await waiting(userId);
    if (!was) return { ok: false, message: NOT_WAITING };
    if (was === 'staff_pending') {
      const { data: flipped, error } = await admin
        .from('user_role')
        .update({ role: 'staff' })
        .eq('user_id', userId)
        .eq('role', 'staff_pending')
        .select('user_id');
      if (error) return { ok: false, message: error.message };
      if (!flipped || flipped.length === 0)
        return { ok: false, message: NOT_WAITING };
    }

    const linked = await link(userId, person);
    if (!linked.ok && was === 'staff_pending') {
      // Back in the queue as it was. Should even this fail, the login is
      // staff and linked to nobody, which the Team page lists as waiting.
      await admin
        .from('user_role')
        .update({ role: 'staff_pending' })
        .eq('user_id', userId)
        .eq('role', 'staff');
    }
    return linked;
  });
}

/** Turn a waiting signup away: the login stays, but reaches nothing. */
export async function rejectStaff(userId: string): Promise<TeamResult> {
  return guarded(async () => {
    if (!isUuid(userId)) return { ok: false, message: 'Invalid account.' };
    const was = await waiting(userId);
    if (!was) return { ok: false, message: NOT_WAITING };
    const { data, error } = await getSupabaseAdmin()
      .from('user_role')
      .update({ role: 'none' })
      .eq('user_id', userId)
      .eq('role', was)
      .select('user_id');
    if (error) return { ok: false, message: error.message };
    if (!data || data.length === 0) return { ok: false, message: NOT_WAITING };
    return { ok: true };
  });
}

const GONE = 'That person is no longer on the board.';

/**
 * Change what someone does: handler, editor, or both. The default title
 * follows the job (Trader for a handler, Editor for an editor); a custom one
 * stays. Videos already given to them stay theirs.
 */
export async function setMemberKind(
  memberId: string,
  kind: MemberKind,
): Promise<TeamResult> {
  return guarded(async () => {
    if (!isUuid(memberId)) return { ok: false, message: 'Invalid person.' };
    if (!MEMBER_KINDS.includes(kind))
      return { ok: false, message: 'Invalid person type.' };
    const admin = getSupabaseAdmin();
    const { data: row, error: readErr } = await admin
      .from('tracker_member')
      .select('role')
      .eq('id', memberId)
      .is('archived_at', null)
      .maybeSingle();
    if (readErr) return { ok: false, message: readErr.message };
    if (!row) return { ok: false, message: GONE };
    // Editor for an editor; Trader for a handler (or both).
    let role = row.role;
    if (kind === 'editor' && role === 'Trader') role = 'Editor';
    if (kind !== 'editor' && role === 'Editor') role = 'Trader';
    const { data, error } = await admin
      .from('tracker_member')
      .update({ kind, role })
      .eq('id', memberId)
      .is('archived_at', null)
      .select('id');
    if (error) return { ok: false, message: error.message };
    if (!data || data.length === 0) return { ok: false, message: GONE };
    return { ok: true };
  });
}

/**
 * Take someone off the team: their login reaches nothing and they leave the
 * board. Never refused over open work — the admin must always be able to
 * shut a leaver out. Their shoots and videos stay, under their name marked
 * as left: a video with them as editor can be given to another editor by its
 * handler, but one they passed on and nobody verified stays unverified.
 */
export async function removePerson(memberId: string): Promise<TeamResult> {
  return guarded(async () => {
    if (!isUuid(memberId)) return { ok: false, message: 'Invalid person.' };
    const admin = getSupabaseAdmin();
    const { data: person, error: readErr } = await admin
      .from('tracker_member')
      .select('user_id')
      .eq('id', memberId)
      .is('archived_at', null)
      .maybeSingle();
    if (readErr) return { ok: false, message: readErr.message };
    if (!person) return { ok: false, message: 'That person is already gone.' };

    // Access first: whatever fails below, the login already reaches nothing.
    if (person.user_id) {
      const { error: roleErr } = await admin
        .from('user_role')
        .update({ role: 'none' })
        .eq('user_id', person.user_id)
        .in('role', ['staff', 'staff_pending']);
      if (roleErr) return { ok: false, message: roleErr.message };
    }

    // Archived last, so a remove that failed above can simply be retried.
    const { data, error } = await admin
      .from('tracker_member')
      .update({ archived_at: new Date().toISOString(), user_id: null })
      .eq('id', memberId)
      .is('archived_at', null)
      .select('id');
    if (error) return { ok: false, message: error.message };
    if (!data || data.length === 0)
      return { ok: false, message: 'That person is already gone.' };
    return { ok: true };
  });
}
