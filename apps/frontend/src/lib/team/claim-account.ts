/**
 * Staff work keeps the admin's account board up to date: passing a shoot's
 * videos on makes the shoot's owner the account's handler and the editor
 * they chose its editor; giving a video to another editor moves the
 * account's editor with it; moving a passed shoot to another account moves
 * the claim with it. The admin only looks at the result.
 *
 * Server-only, called by staff actions after their own write has landed — a
 * plain module, so it is not an endpoint of its own. The board is a
 * by-product: a failed update is logged and never fails the staff's save.
 */

import { getSupabaseAdmin } from '@d3/database';
import { onBoard } from './on-board';

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
  claim: { handlerId?: string; editorId?: string },
  /** The staff login making the change, for the handover log. */
  userId: string,
): Promise<void> {
  if (!creatorId || (!claim.handlerId && !claim.editorId)) return;
  const row: Record<string, string> = {
    creator_id: creatorId,
    updated_by: userId,
  };
  try {
    // Only someone who runs accounts takes one over: an editor who shot
    // something still just edits.
    if (
      claim.handlerId &&
      (await onBoard([claim.handlerId], ['handler', 'both']))
    )
      row.handler_id = claim.handlerId;
    if (claim.editorId) row.editor_id = claim.editorId;
    if (!row.handler_id && !row.editor_id) return;
    // Merges: only the columns sent are written, so a claim of the editor
    // leaves the handler alone and the reverse.
    const { error } = await getSupabaseAdmin()
      .from('tracker_assignment')
      .upsert(row, { onConflict: 'creator_id' });
    if (error) console.error('[team] claimAccount:', error);
  } catch (e) {
    console.error('[team] claimAccount:', e);
  }
}

type LogRow = {
  field: string;
  old_value: string | null;
  new_value: string | null;
  changed_by: string | null;
};

/**
 * Take back this person's claim on an account their work has just left (a
 * passed shoot moved to another account): each of handler and editor goes
 * back to what it was before — but only while this person's claim is still
 * the latest change to it and none of the work behind it is left on the
 * account. So a mistaken pick undoes itself, and a real handover stays.
 */
export async function releaseAccount(
  creatorId: string | null,
  memberId: string,
  userId: string,
): Promise<void> {
  if (!creatorId) return;
  try {
    const admin = getSupabaseAdmin();
    const [cur, log, left] = await Promise.all([
      admin
        .from('tracker_assignment')
        .select('handler_id, editor_id')
        .eq('creator_id', creatorId)
        .maybeSingle(),
      admin
        .from('tracker_assignment_log')
        .select('field, old_value, new_value, changed_by')
        .eq('creator_id', creatorId)
        .in('field', ['handler', 'editor'])
        .order('id', { ascending: false })
        .limit(50),
      admin
        .from('tracker_video')
        .select('handler_id, editor_id')
        .eq('creator_id', creatorId),
    ]);
    const failed = cur.error ?? log.error ?? left.error;
    if (failed) throw failed;
    if (!cur.data) return;
    const now = cur.data as {
      handler_id: string | null;
      editor_id: string | null;
    };
    const rows = (log.data ?? []) as LogRow[];
    const latest = (field: string) => rows.find((r) => r.field === field);
    const videos = (left.data ?? []) as {
      handler_id: string | null;
      editor_id: string | null;
    }[];
    const back: Record<string, string | null> = {};
    const h = latest('handler');
    if (
      h?.changed_by === userId &&
      h.new_value === memberId &&
      now.handler_id === memberId &&
      !videos.some((v) => v.handler_id === memberId)
    )
      back.handler_id = h.old_value;
    const e = latest('editor');
    if (
      e?.changed_by === userId &&
      e.new_value !== null &&
      now.editor_id === e.new_value &&
      !videos.some((v) => v.editor_id === e.new_value)
    )
      back.editor_id = e.old_value;
    if (Object.keys(back).length === 0) return;
    // ponytail: read-then-write, so a change landing in between is
    // overwritten; the window is one request, and the log keeps both.
    const { error } = await admin
      .from('tracker_assignment')
      .update({ ...back, updated_by: userId })
      .eq('creator_id', creatorId);
    if (error) throw error;
  } catch (err) {
    console.error('[team] releaseAccount:', err);
  }
}
