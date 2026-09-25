/**
 * Who is calling a shoot or video action: an approved staff member, who acts
 * only as their own board person, taken from their session. Anyone else — an
 * admin included, who only looks at this work — is refused. Server-only; a
 * plain module so it is not itself a callable action.
 */

import { dbError } from './db-error';
import { requireStaff } from './staff-context';

export interface Actor {
  userId: string;
  /** The staff member's own person on the board. */
  memberId: string;
}

export async function getActor(): Promise<Actor> {
  const staff = await requireStaff();
  return { userId: staff.userId, memberId: staff.memberId };
}

/** Runs an action body with the caller, turning a throw into a refusal. */
export async function asActor<R extends { ok: boolean; message?: string }>(
  fn: (a: Actor) => Promise<R>,
): Promise<R | { ok: false; message: string }> {
  try {
    return await fn(await getActor());
  } catch (e) {
    // requireStaff's refusal is the answer; anything else (a failed lookup, a
    // database error) goes to the server log, not the screen.
    if (e instanceof Error && e.message === 'Not authorized.')
      return { ok: false, message: e.message };
    return dbError('asActor', e);
  }
}
