/**
 * A failed database call (or any other unexpected failure), as the person on
 * the screen should see it: a generic, translated message. The whole error —
 * code, details, hint — goes to the server log.
 */
export function dbError(
  where: string,
  error: unknown,
): { ok: false; message: string } {
  console.error(`[team] ${where}:`, error);
  return { ok: false, message: 'Could not save. Try again.' };
}
