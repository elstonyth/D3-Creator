/**
 * Who a shoot or video action runs as.
 *
 * - Staff: always their own board person, taken from their session.
 *   Anything the browser names is ignored.
 * - The admin: a handler's steps for anyone, as the person named in `as`
 *   (the shoot's or the video's own, or who a new shoot is for), who must
 *   still be on the board. An action that names nobody — an editor's step —
 *   refuses the admin.
 * - Anyone else is refused.
 *
 * Server-only; a plain module so it is not itself a callable action.
 */

import { getAuthContext } from '@gitroom/frontend/lib/auth';
import { isUuid } from '@gitroom/frontend/lib/ids';
import { dbError } from './db-error';
import { onBoard } from './on-board';
import { getStaffContext } from './staff-context';

export interface Actor {
  /** The login doing it: stamped on what it writes. */
  userId: string;
  /** The board person it is done as. */
  memberId: string;
}

export async function getActor(as?: unknown): Promise<Actor> {
  // Staff first: one session read, as before, for every staff write.
  const staff = await getStaffContext();
  if (staff) return { userId: staff.userId, memberId: staff.memberId };
  const auth = await getAuthContext();
  if (auth?.role === 'admin' && isUuid(as) && (await onBoard([as])))
    return { userId: auth.userId, memberId: as };
  throw new Error('Not authorized.');
}

/**
 * Runs an action body with the caller, turning a throw into a refusal. `as`
 * is the person the admin acts as (see getActor); staff's is ignored.
 */
export async function asActor<R extends { ok: boolean; message?: string }>(
  fn: (a: Actor) => Promise<R>,
  as?: unknown,
): Promise<R | { ok: false; message: string }> {
  try {
    return await fn(await getActor(as));
  } catch (e) {
    // The refusal is the answer; anything else (a failed lookup, a database
    // error) goes to the server log, not the screen.
    if (e instanceof Error && e.message === 'Not authorized.')
      return { ok: false, message: e.message };
    return dbError('asActor', e);
  }
}
