/**
 * Whether every person named is on the work board: exists and is not
 * archived — and, when `kinds` is given, has one of those jobs. Nulls are
 * skipped. Server-only (service-role read), called by actions that have
 * already checked the caller — a plain module, so it is not an endpoint of
 * its own.
 */

import { getSupabaseAdmin } from '@d3/database';
import type { MemberKind } from '@gitroom/frontend/lib/tracker';

export async function onBoard(
  ids: (string | null)[],
  kinds?: MemberKind[],
): Promise<boolean> {
  const wanted = new Set(ids.filter((x): x is string => x !== null));
  if (wanted.size === 0) return true;
  let q = getSupabaseAdmin()
    .from('tracker_member')
    .select('id')
    .in('id', [...wanted])
    .is('archived_at', null);
  if (kinds) q = q.in('kind', kinds);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return (data ?? []).length === wanted.size;
}
