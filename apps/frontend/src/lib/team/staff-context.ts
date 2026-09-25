/**
 * Who the signed-in staff member is on the work board.
 *
 * A staff login is only half of it: an admin approves the account on the
 * Team page by linking it to a person on the board (tracker_member.user_id).
 * Everything a staff member reads or writes is scoped by that person's id,
 * always taken from here — never from the browser.
 *
 * Server-only (service-role read behind the role check).
 */

import { cache } from 'react';
import { getSupabaseAdmin } from '@d3/database';
import { getAuthContext } from '@gitroom/frontend/lib/auth';
import {
  parseMemberKind,
  type MemberKind,
} from '@gitroom/frontend/lib/tracker';

export interface StaffContext {
  userId: string;
  email: string | null;
  /** The board person this login is linked to. */
  memberId: string;
  name: string;
  kind: MemberKind;
}

/**
 * The approved staff member and their board person, or null — not signed in,
 * not staff, or linked to nobody (a person can be archived after approval).
 */
export const getStaffContext = cache(async (): Promise<StaffContext | null> => {
  const auth = await getAuthContext();
  if (!auth || auth.role !== 'staff') return null;
  const { data, error } = await getSupabaseAdmin()
    .from('tracker_member')
    .select('id, name, kind')
    .eq('user_id', auth.userId)
    .is('archived_at', null)
    .maybeSingle();
  // A failed lookup must not read as "not linked": fail loudly instead.
  if (error) throw new Error(`staff context: ${error.message}`);
  if (!data) return null;
  return {
    userId: auth.userId,
    email: auth.email,
    memberId: data.id,
    name: data.name,
    kind: parseMemberKind(data.kind),
  };
});

/** For server actions: the staff member, or "Not authorized." */
export async function requireStaff(): Promise<StaffContext> {
  const staff = await getStaffContext();
  if (!staff) throw new Error('Not authorized.');
  return staff;
}
