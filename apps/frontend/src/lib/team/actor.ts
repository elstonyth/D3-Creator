/**
 * Who is calling a team action: an admin (who may act for anyone) or an
 * approved staff member (who may act only as their own board person, taken
 * from their session). Anyone else is refused. Server-only; a plain module so
 * it is not itself a callable action.
 */

import { getAuthContext } from '@gitroom/frontend/lib/auth';
import { requireStaff } from './staff-context';

export interface Actor {
  userId: string;
  /** The staff member's own person; null for an admin. */
  memberId: string | null;
}

export async function getActor(): Promise<Actor> {
  const auth = await getAuthContext();
  if (auth?.role === 'admin') return { userId: auth.userId, memberId: null };
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
    return { ok: false, message: e instanceof Error ? e.message : 'Failed.' };
  }
}
