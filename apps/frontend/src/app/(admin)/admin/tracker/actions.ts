'use server';

/**
 * Work tracker mutations. Every action re-checks the admin role before it
 * touches the service-role client, and every input is bounded here even
 * though the tables carry check constraints — a rejected write should read
 * as a sentence, not a Postgres error.
 */

import { revalidatePath } from 'next/cache';
import { getSupabaseAdmin } from '@d3/database';
import { requireAdmin } from '@gitroom/frontend/lib/auth';
import { isUuid } from '@gitroom/frontend/lib/ids';
import { isDateKey, type MemberKind } from '@gitroom/frontend/lib/tracker';

export interface ActionResult {
  ok: boolean;
  message?: string;
  id?: string;
}

const PAGE = '/admin/tracker';

function cleanTitle(v: unknown, max = 200): string | null {
  if (typeof v !== 'string') return null;
  const s = v.replace(/\s+/g, ' ').trim();
  return s.length >= 1 && s.length <= max ? s : null;
}

async function guarded(fn: () => Promise<ActionResult>): Promise<ActionResult> {
  try {
    await requireAdmin();
    const r = await fn();
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

export async function saveRemarks(body: string): Promise<ActionResult> {
  return guarded(async () => {
    if (typeof body !== 'string' || body.length > 20000) {
      return {
        ok: false,
        message: 'Remarks are limited to 20,000 characters.',
      };
    }
    const { error } = await getSupabaseAdmin()
      .from('tracker_note')
      .upsert({ key: 'remarks', body }, { onConflict: 'key' });
    return error ? { ok: false, message: error.message } : { ok: true };
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
  return guarded(async () => {
    if (!isUuid(creatorId)) return { ok: false, message: 'Invalid creator.' };
    const row: Record<string, unknown> = { creator_id: creatorId };
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
    const { error } = await getSupabaseAdmin()
      .from('tracker_assignment')
      .upsert(row, { onConflict: 'creator_id' });
    return error ? { ok: false, message: error.message } : { ok: true };
  });
}

/**
 * One column's full order: every id lands in `handlerId` (null = unassigned)
 * with its index as sort_order. One upsert; merge-duplicates writes only the
 * columns sent, so each card keeps its editor and posting flag.
 */
export async function placeCards(
  handlerId: string | null,
  creatorIds: string[],
): Promise<ActionResult> {
  return guarded(async () => {
    if (handlerId !== null && !isUuid(handlerId))
      return { ok: false, message: 'Invalid person.' };
    if (
      !Array.isArray(creatorIds) ||
      creatorIds.length === 0 ||
      creatorIds.length > 500 ||
      !creatorIds.every(isUuid)
    )
      return { ok: false, message: 'Invalid order.' };
    const { error } = await getSupabaseAdmin()
      .from('tracker_assignment')
      .upsert(
        creatorIds.map((id, i) => ({
          creator_id: id,
          handler_id: handlerId,
          sort_order: i,
        })),
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
    if (kind !== 'handler' && kind !== 'editor')
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

export async function removeMember(id: string): Promise<ActionResult> {
  return guarded(async () => {
    if (!isUuid(id)) return { ok: false, message: 'Invalid person.' };
    // handler_id / editor_id are ON DELETE SET NULL — their accounts fall back
    // to the unassigned pool rather than disappearing.
    const { error } = await getSupabaseAdmin()
      .from('tracker_member')
      .delete()
      .eq('id', id);
    return error ? { ok: false, message: error.message } : { ok: true };
  });
}
