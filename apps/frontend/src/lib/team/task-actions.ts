'use server';

/**
 * A staff member ticking off a job task the admin gave them. Filtered by
 * their own person (from the session), so only tasks assigned to them move.
 * The admin keeps ticking tasks on the tracker board as before.
 */

import { getSupabaseAdmin } from '@d3/database';
import { isUuid } from '@gitroom/frontend/lib/ids';
import { requireStaff } from './staff-context';

export interface TaskResult {
  ok: boolean;
  message?: string;
}

export async function setMyTaskDone(
  id: string,
  done: boolean,
): Promise<TaskResult> {
  try {
    const me = await requireStaff();
    if (!isUuid(id)) return { ok: false, message: 'Invalid task.' };
    const { data, error } = await getSupabaseAdmin()
      .from('tracker_task')
      .update({
        done: Boolean(done),
        completed_at: done ? new Date().toISOString() : null,
      })
      .eq('id', id)
      .eq('assignee_id', me.memberId)
      .select('id');
    if (error) return { ok: false, message: error.message };
    if (!data || data.length === 0)
      return { ok: false, message: 'That task is not yours, or it is gone.' };
    return { ok: true };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : 'Failed.' };
  }
}
