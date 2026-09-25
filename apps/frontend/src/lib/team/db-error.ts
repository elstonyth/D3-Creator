/**
 * A failed database call, as the person on the screen should see it: a generic,
 * translated message. The real error goes to the server log.
 */
export function dbError(
  where: string,
  error: { message: string },
): { ok: false; message: string } {
  console.error(`[team] ${where}:`, error.message);
  return { ok: false, message: 'Could not save. Try again.' };
}
