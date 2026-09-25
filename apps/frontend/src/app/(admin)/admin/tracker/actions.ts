'use server';

/**
 * Work tracker mutations. Every action re-checks the admin role before it
 * touches the service-role client, and every input is bounded here even
 * though the tables carry check constraints — a rejected write should read
 * as a sentence, not a Postgres error.
 */

import { revalidatePath } from 'next/cache';
import { getSupabaseAdmin } from '@d3/database';
import { requireAdmin, type AuthContext } from '@gitroom/frontend/lib/auth';
import { isUuid } from '@gitroom/frontend/lib/ids';
import { onBoard } from '@gitroom/frontend/lib/team/on-board';
import {
  cleanTitle,
  isDateKey,
  MEMBER_KINDS,
  type MemberKind,
} from '@gitroom/frontend/lib/tracker';

export interface ActionResult {
  ok: boolean;
  message?: string;
  id?: string;
  /** saveRemarks: the note's new `updated_at` (on a conflict, its current one). */
  at?: string;
  /** saveRemarks: refused because another screen saved first. */
  conflict?: boolean;
  /** saveRemarks conflict: the note's current text. */
  body?: string;
}

const PAGE = '/admin/tracker';
// A tab opened before someone was removed still offers them; the server
// refuses rather than handing work to a person who has left.
const NOT_ON_BOARD = 'That person is not on the board.';

// `me` is the signed-in admin; writes to tracker_assignment record them as
// `updated_by`, which the handover log trigger copies onto every change.
async function guarded(
  fn: (me: AuthContext) => Promise<ActionResult>,
): Promise<ActionResult> {
  try {
    const me = await requireAdmin();
    const r = await fn(me);
    if (r.ok) revalidatePath(PAGE);
    return r;
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : 'Failed.' };
  }
}

// ---- tasks -----------------------------------------------------------------

export async function addTask(title: string): Promise<ActionResult> {
  return guarded(async () => {
    const t = cleanTitle(title);
    if (!t)
      return { ok: false, message: 'Task needs a title (max 200 chars).' };
    const admin = getSupabaseAdmin();
    // New tasks go to the bottom of the open list.
    const { data: last } = await admin
      .from('tracker_task')
      .select('sort_order')
      .order('sort_order', { ascending: false })
      .limit(1)
      .maybeSingle();
    const { data, error } = await admin
      .from('tracker_task')
      .insert({ title: t, sort_order: (last?.sort_order ?? -1) + 1 })
      .select('id')
      .single();
    if (error) return { ok: false, message: error.message };
    return { ok: true, id: data.id };
  });
}

export async function updateTask(
  id: string,
  title: string,
): Promise<ActionResult> {
  return guarded(async () => {
    if (!isUuid(id)) return { ok: false, message: 'Invalid task.' };
    const t = cleanTitle(title);
    if (!t)
      return { ok: false, message: 'Task needs a title (max 200 chars).' };
    const { error } = await getSupabaseAdmin()
      .from('tracker_task')
      .update({ title: t })
      .eq('id', id);
    return error ? { ok: false, message: error.message } : { ok: true };
  });
}

/** Give a task to someone (they see it in the staff portal), or back to anyone. */
export async function assignTask(
  id: string,
  assigneeId: string | null,
): Promise<ActionResult> {
  return guarded(async () => {
    if (!isUuid(id)) return { ok: false, message: 'Invalid task.' };
    if (assigneeId !== null && !isUuid(assigneeId))
      return { ok: false, message: 'Invalid person.' };
    if (!(await onBoard([assigneeId])))
      return { ok: false, message: NOT_ON_BOARD };
    const { data, error } = await getSupabaseAdmin()
      .from('tracker_task')
      .update({ assignee_id: assigneeId })
      .eq('id', id)
      .select('id');
    if (error) return { ok: false, message: error.message };
    if (!data || data.length === 0)
      return { ok: false, message: 'That task is gone.' };
    return { ok: true };
  });
}

export async function setTaskDone(
  id: string,
  done: boolean,
): Promise<ActionResult> {
  return guarded(async () => {
    if (!isUuid(id)) return { ok: false, message: 'Invalid task.' };
    const { error } = await getSupabaseAdmin()
      .from('tracker_task')
      .update({ done, completed_at: done ? new Date().toISOString() : null })
      .eq('id', id);
    return error ? { ok: false, message: error.message } : { ok: true };
  });
}

export async function deleteTask(id: string): Promise<ActionResult> {
  return guarded(async () => {
    if (!isUuid(id)) return { ok: false, message: 'Invalid task.' };
    const { error } = await getSupabaseAdmin()
      .from('tracker_task')
      .delete()
      .eq('id', id);
    return error ? { ok: false, message: error.message } : { ok: true };
  });
}

/** Persist a full ordering: index in `ids` becomes sort_order. */
export async function reorderTasks(ids: string[]): Promise<ActionResult> {
  return guarded(async () => {
    if (!Array.isArray(ids) || ids.length > 500 || !ids.every(isUuid)) {
      return { ok: false, message: 'Invalid order.' };
    }
    const admin = getSupabaseAdmin();
    // ponytail: one update per row; the list is a few dozen items at most.
    const results = await Promise.all(
      ids.map((id, i) =>
        admin.from('tracker_task').update({ sort_order: i }).eq('id', id),
      ),
    );
    const failed = results.find((r) => r.error);
    return failed?.error
      ? { ok: false, message: failed.error.message }
      : { ok: true };
  });
}

// ---- events ----------------------------------------------------------------

export async function addEvent(
  date: string,
  title: string,
): Promise<ActionResult> {
  return guarded(async () => {
    const t = cleanTitle(title);
    if (!isDateKey(date)) return { ok: false, message: 'Invalid date.' };
    if (!t)
      return { ok: false, message: 'Event needs a title (max 200 chars).' };
    const { data, error } = await getSupabaseAdmin()
      .from('tracker_event')
      .insert({ event_date: date, title: t })
      .select('id')
      .single();
    if (error) return { ok: false, message: error.message };
    return { ok: true, id: data.id };
  });
}

export async function updateEvent(
  id: string,
  title: string,
): Promise<ActionResult> {
  return guarded(async () => {
    if (!isUuid(id)) return { ok: false, message: 'Invalid event.' };
    const t = cleanTitle(title);
    if (!t)
      return { ok: false, message: 'Event needs a title (max 200 chars).' };
    const { error } = await getSupabaseAdmin()
      .from('tracker_event')
      .update({ title: t })
      .eq('id', id);
    return error ? { ok: false, message: error.message } : { ok: true };
  });
}

export async function deleteEvent(id: string): Promise<ActionResult> {
  return guarded(async () => {
    if (!isUuid(id)) return { ok: false, message: 'Invalid event.' };
    const { error } = await getSupabaseAdmin()
      .from('tracker_event')
      .delete()
      .eq('id', id);
    return error ? { ok: false, message: error.message } : { ok: true };
  });
}

// ---- remarks ---------------------------------------------------------------

export async function saveRemarks(
  body: string,
  seen: string | null,
): Promise<ActionResult> {
  return guarded(async () => {
    if (typeof body !== 'string' || body.length > 20000) {
      return {
        ok: false,
        message: 'Remarks are limited to 20,000 characters.',
      };
    }
    // A page loaded before versions existed sends none.
    if (seen !== null && typeof seen !== 'string') {
      return {
        ok: false,
        message:
          'This page is out of date. Copy your text, then reload the page.',
      };
    }
    const admin = getSupabaseAdmin();
    if (seen === null) {
      // No version was loaded (the row was missing): create or replace.
      const { data, error } = await admin
        .from('tracker_note')
        .upsert({ key: 'remarks', body }, { onConflict: 'key' })
        .select('updated_at')
        .single();
      return error
        ? { ok: false, message: error.message }
        : { ok: true, at: data.updated_at };
    }
    // Only over the version this screen loaded: a tab opened earlier must
    // not wipe what was typed elsewhere since.
    const { data, error } = await admin
      .from('tracker_note')
      .update({ body })
      .eq('key', 'remarks')
      .eq('updated_at', seen)
      .select('updated_at');
    if (error) return { ok: false, message: error.message };
    if (!data || data.length === 0) {
      // Hand back what is there now: if it is this screen's own last save,
      // whose answer was lost on the way back, the screen carries on from it.
      // A failed read leaves a plain conflict.
      const { data: now } = await admin
        .from('tracker_note')
        .select('body, updated_at')
        .eq('key', 'remarks')
        .maybeSingle();
      return {
        ok: false,
        conflict: true,
        message:
          'These remarks were changed elsewhere. Copy your text, then reload the page.',
        body: now?.body,
        at: now?.updated_at,
      };
    }
    return { ok: true, at: data[0].updated_at };
  });
}

// ---- staffing --------------------------------------------------------------

export interface AssignmentPatch {
  handlerId?: string | null;
  editorId?: string | null;
  scheduledPosting?: boolean;
}

export async function setAssignment(
  creatorId: string,
  patch: AssignmentPatch,
): Promise<ActionResult> {
  return guarded(async (me) => {
    if (!isUuid(creatorId)) return { ok: false, message: 'Invalid creator.' };
    const row: Record<string, unknown> = {
      creator_id: creatorId,
      updated_by: me.userId,
    };
    if ('handlerId' in patch) {
      if (patch.handlerId != null && !isUuid(patch.handlerId))
        return { ok: false, message: 'Invalid person.' };
      row.handler_id = patch.handlerId ?? null;
    }
    if ('editorId' in patch) {
      if (patch.editorId != null && !isUuid(patch.editorId))
        return { ok: false, message: 'Invalid person.' };
      row.editor_id = patch.editorId ?? null;
    }
    if ('scheduledPosting' in patch)
      row.scheduled_posting = Boolean(patch.scheduledPosting);
    if (!(await onBoard([patch.handlerId ?? null, patch.editorId ?? null])))
      return { ok: false, message: NOT_ON_BOARD };
    const { error } = await getSupabaseAdmin()
      .from('tracker_assignment')
      .upsert(row, { onConflict: 'creator_id' });
    return error ? { ok: false, message: error.message } : { ok: true };
  });
}

/**
 * One column's full order: index in `creatorIds` becomes sort_order. Only the
 * cards in `movedIds` — the ones that arrived in this column — have their
 * handler written. The rest keep whatever handler the database holds, so a
 * tab that has not seen a handover made elsewhere cannot undo it by
 * reordering. Merge-duplicates writes only the columns sent, so every card
 * keeps its editor and posting flag.
 */
export async function placeCards(
  handlerId: string | null,
  creatorIds: string[],
  movedIds: string[],
): Promise<ActionResult> {
  return guarded(async (me) => {
    if (handlerId !== null && !isUuid(handlerId))
      return { ok: false, message: 'Invalid person.' };
    if (
      !Array.isArray(creatorIds) ||
      creatorIds.length === 0 ||
      creatorIds.length > 500 ||
      !creatorIds.every(isUuid) ||
      new Set(creatorIds).size !== creatorIds.length ||
      !Array.isArray(movedIds) ||
      !movedIds.every((id) => creatorIds.includes(id))
    )
      return { ok: false, message: 'Invalid order.' };
    if (!(await onBoard([handlerId])))
      return { ok: false, message: NOT_ON_BOARD };
    const admin = getSupabaseAdmin();
    const moved = new Set(movedIds);
    // The cards that stayed put first, the handovers last. If the handover
    // write fails, none of it is saved — exactly what the board's rollback
    // shows. A failed order write only misorders cards until the next load.
    const rest = creatorIds.flatMap((id, i) =>
      moved.has(id) ? [] : [{ creator_id: id, sort_order: i }],
    );
    if (rest.length > 0) {
      const { error } = await admin
        .from('tracker_assignment')
        .upsert(rest, { onConflict: 'creator_id' });
      if (error) return { ok: false, message: error.message };
    }
    if (moved.size === 0) return { ok: true };
    // updated_by names who made the handover in the log the trigger writes.
    const { error } = await admin.from('tracker_assignment').upsert(
      creatorIds.flatMap((id, i) =>
        moved.has(id)
          ? [
              {
                creator_id: id,
                handler_id: handlerId,
                sort_order: i,
                updated_by: me.userId,
              },
            ]
          : [],
      ),
      { onConflict: 'creator_id' },
    );
    return error ? { ok: false, message: error.message } : { ok: true };
  });
}

export async function addMember(
  name: string,
  role: string,
  kind: MemberKind,
): Promise<ActionResult> {
  return guarded(async () => {
    if (!MEMBER_KINDS.includes(kind))
      return { ok: false, message: 'Invalid person type.' };
    const n = cleanTitle(name, 40);
    const r = cleanTitle(role, 40) ?? (kind === 'editor' ? 'Editor' : 'Trader');
    if (!n) return { ok: false, message: 'Name is required (max 40 chars).' };
    const admin = getSupabaseAdmin();
    const { data: last } = await admin
      .from('tracker_member')
      .select('sort_order')
      .order('sort_order', { ascending: false })
      .limit(1)
      .maybeSingle();
    const { data, error } = await admin
      .from('tracker_member')
      .insert({
        name: n,
        role: r,
        kind,
        sort_order: (last?.sort_order ?? -1) + 1,
      })
      .select('id')
      .single();
    if (error) return { ok: false, message: error.message };
    return { ok: true, id: data.id };
  });
}

/**
 * Take a person off the board. They are archived, never deleted: their
 * shoots, videos and handovers keep a name. A staff login linked to them is
 * switched off, their accounts fall back to Unassigned / Nobody (recorded in
 * the handover log as this admin's change), and their open tasks go back to
 * nobody. Video jobs and shoots stay as they are for the admin to hand on.
 *
 * Every step can be repeated, and archiving comes last: if a step fails the
 * person is still on the board, and removing them again finishes the job.
 */
export async function removeMember(id: string): Promise<ActionResult> {
  return guarded(async (me) => {
    if (!isUuid(id)) return { ok: false, message: 'Invalid person.' };
    const admin = getSupabaseAdmin();
    const { data: person, error: findErr } = await admin
      .from('tracker_member')
      .select('user_id')
      .eq('id', id)
      .is('archived_at', null)
      .maybeSingle();
    if (findErr) return { ok: false, message: findErr.message };
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

    const cleared = await Promise.all([
      admin
        .from('tracker_assignment')
        .update({ handler_id: null, updated_by: me.userId })
        .eq('handler_id', id),
      admin
        .from('tracker_assignment')
        .update({ editor_id: null, updated_by: me.userId })
        .eq('editor_id', id),
      // Nobody would ever see them; done ones keep the name as a record.
      admin
        .from('tracker_task')
        .update({ assignee_id: null })
        .eq('assignee_id', id)
        .eq('done', false),
    ]);
    const clearErr = cleared.find((r) => r.error)?.error;
    if (clearErr) return { ok: false, message: clearErr.message };

    const { error: archiveErr } = await admin
      .from('tracker_member')
      .update({ archived_at: new Date().toISOString(), user_id: null })
      .eq('id', id);
    return archiveErr
      ? { ok: false, message: archiveErr.message }
      : { ok: true };
  });
}
