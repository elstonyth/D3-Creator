import type { ActionResult } from './actions';

/**
 * A server action can throw on the client — a dropped connection on a phone, or
 * a tab opened before a deploy. Every tracker caller already knows how to handle
 * a refusal (roll back, show the toast), so a throw becomes one.
 */
export async function safeCall(
  call: () => Promise<ActionResult>,
): Promise<ActionResult> {
  try {
    return await call();
  } catch {
    return { ok: false, message: 'Could not save. Try again.' };
  }
}
