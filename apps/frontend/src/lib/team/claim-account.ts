/**
 * Staff work keeps the editor on the admin's account board up to date:
 * passing a shoot's videos on makes the editor given most of them the
 * account's editor; giving a video to another editor moves the account's
 * editor with it; moving a passed shoot to another account moves the claim
 * with it. Who handles an account is the admin's to set when a new client
 * comes in (placeAccount, by dragging), and staff work never moves it.
 *
 * Server-only, called by staff actions after their own write has landed — a
 * plain module, so it is not an endpoint of its own. The board is a
 * by-product: a failed update is logged and never fails the staff's save.
 */

import { getSupabaseAdmin } from '@d3/database';

/** The editor a pass gives most videos to; a tie goes to the first listed. */
export function mainEditor(editorIds: string[]): string | null {
  const count = new Map<string, number>();
  for (const id of editorIds) count.set(id, (count.get(id) ?? 0) + 1);
  let best: string | null = null;
  for (const [id, n] of count)
    if (best === null || n > count.get(best)!) best = id;
  return best;
}

export async function claimAccount(
  creatorId: string | null,
  editorId: string | null,
  /** The staff login making the change, for the handover log. */
  userId: string,
): Promise<void> {
  if (!creatorId || !editorId) return;
  try {
    // Merges: only the columns sent are written, so the handler stays.
    const { error } = await getSupabaseAdmin()
      .from('tracker_assignment')
      .upsert(
        { creator_id: creatorId, editor_id: editorId, updated_by: userId },
        { onConflict: 'creator_id' },
      );
    if (error) console.error('[team] claimAccount:', error);
  } catch (e) {
    console.error('[team] claimAccount:', e);
  }
}

/**
 * Take back this login's editor claim on an account its work has just left
 * (a video taken back, a passed shoot moved to another account): the editor
 * goes back to who it was before — but only while this claim is still the
 * latest change to it and none of that editor's videos is left on the
 * account. So a mistaken pick undoes itself, and a real handover stays.
 */
export async function releaseAccount(
  creatorId: string | null,
  userId: string,
): Promise<void> {
  if (!creatorId) return;
  try {
    const admin = getSupabaseAdmin();
    const [cur, log, left] = await Promise.all([
      admin
        .from('tracker_assignment')
        .select('editor_id')
        .eq('creator_id', creatorId)
        .maybeSingle(),
      admin
        .from('tracker_assignment_log')
        .select('old_value, new_value, changed_by')
        .eq('creator_id', creatorId)
        .eq('field', 'editor')
        .order('id', { ascending: false })
        .limit(1),
      admin
        .from('tracker_video')
        .select('editor_id')
        .eq('creator_id', creatorId),
    ]);
    const failed = cur.error ?? log.error ?? left.error;
    if (failed) throw failed;
    const now = cur.data as { editor_id: string | null } | null;
    const e = (
      (log.data ?? []) as {
        old_value: string | null;
        new_value: string | null;
        changed_by: string | null;
      }[]
    )[0];
    const videos = (left.data ?? []) as { editor_id: string | null }[];
    if (
      !now ||
      !e ||
      e.changed_by !== userId ||
      e.new_value === null ||
      now.editor_id !== e.new_value ||
      videos.some((v) => v.editor_id === e.new_value)
    )
      return;
    // ponytail: read-then-write, so a change landing in between is
    // overwritten; the window is one request, and the log keeps both.
    const { error } = await admin
      .from('tracker_assignment')
      .update({ editor_id: e.old_value, updated_by: userId })
      .eq('creator_id', creatorId);
    if (error) throw error;
  } catch (err) {
    console.error('[team] releaseAccount:', err);
  }
}
