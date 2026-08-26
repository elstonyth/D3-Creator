/**
 * Supabase auth errors → one sentence a user can act on.
 *
 * The old behaviour collapsed every failure into "Could not create account.
 * Check your details and try again.", which is the same sentence whether the
 * password was eight characters, the mail server was rate-limiting, or the
 * laptop was offline. None of those are fixed by "check your details".
 *
 * WHAT IS DELIBERATELY *NOT* HERE: an "email already registered" message.
 * Supabase obscures that case on purpose — `signUp()` returns a success with an
 * empty `identities` array rather than an error, and it emails the existing
 * account instead. Surfacing it would turn the form into an account-enumeration
 * oracle. The confirmation screen carries a "already have an account? sign in"
 * line instead, which serves the honest user without answering the attacker.
 */

/** The shape we need from `AuthError` without importing the class. */
export interface AuthErrorish {
  code?: string;
  message?: string;
  status?: number;
}

const SIGN_UP_MESSAGES: Record<string, string> = {
  weak_password:
    'That password is too easy to guess. Use at least 8 characters, and avoid common words.',
  email_address_invalid: 'That email address does not look right.',
  email_provider_disabled: 'Email sign-up is turned off right now.',
  signup_disabled: 'New accounts are closed at the moment.',
  over_email_send_rate_limit:
    'Too many emails sent to that address. Wait a few minutes and try again.',
  over_request_rate_limit: 'Too many attempts. Wait a minute and try again.',
  validation_failed: 'Check the email and password, then try again.',
};

const SIGN_IN_MESSAGES: Record<string, string> = {
  invalid_credentials: 'Invalid email or password.',
  email_not_confirmed:
    'Confirm your email first — check your inbox for the link we sent.',
  over_request_rate_limit: 'Too many attempts. Wait a minute and try again.',
  user_banned: 'That account is suspended. Contact support.',
};

const RESET_MESSAGES: Record<string, string> = {
  over_email_send_rate_limit:
    'Too many emails sent to that address. Wait a few minutes and try again.',
  over_request_rate_limit: 'Too many attempts. Wait a minute and try again.',
  same_password: 'That is already your password. Choose a different one.',
  weak_password:
    'That password is too easy to guess. Use at least 8 characters, and avoid common words.',
};

function pick(
  table: Record<string, string>,
  error: AuthErrorish | null,
  fallback: string,
): string {
  if (!error) return fallback;
  // `code` is the stable identifier; `message` is prose and changes between
  // releases, so it is only ever a last resort and is never shown raw.
  const byCode = error.code ? table[error.code] : undefined;
  if (byCode) return byCode;
  // Older Supabase builds report the rate limit as a bare 429 with no code.
  if (error.status === 429)
    return 'Too many attempts. Wait a minute and try again.';
  return fallback;
}

export function signUpErrorMessage(error: AuthErrorish | null): string {
  return pick(
    SIGN_UP_MESSAGES,
    error,
    'Could not create the account. Try again in a moment.',
  );
}

export function signInErrorMessage(error: AuthErrorish | null): string {
  return pick(SIGN_IN_MESSAGES, error, 'Invalid email or password.');
}

export function resetErrorMessage(error: AuthErrorish | null): string {
  return pick(
    RESET_MESSAGES,
    error,
    'Could not update the password. Try again in a moment.',
  );
}
