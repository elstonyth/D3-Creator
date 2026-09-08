/**
 * Scraper error taxonomy.
 *
 * Maps to profile.scrape_status values:
 *  - failed         transient (network, upstream hiccup) — retry next day
 *  - private        profile is private/restricted
 *  - not_found      URL 404 / account deleted
 *  - throttled      upstream rate-limit
 *  - handle_changed scrape returned a different handle than expected
 *
 * Caller decides which status to write based on the error class.
 *
 * Orthogonal to status: `scope` says whether the PROFILE or our access to the
 * whole PLATFORM is broken. A platform-scope error means the profile's status
 * should not be touched at all — see ScrapeErrorScope below.
 *
 * NOTE: ApifyTimeoutError / ApifyEmptyResultError / ApifyThrottledError
 * class names are retained for API stability after the Apify → TikHub/BrightData
 * migration. They now represent generic upstream timeout/empty/throttle errors.
 */

export type ScrapeStatusCode =
  | 'failed'
  | 'private'
  | 'not_found'
  | 'throttled'
  | 'handle_changed';

/**
 * Who is broken: this one profile, or our access to the whole platform.
 *
 * `platform` is for failures where the profile is almost certainly fine and the
 * upstream credential/account is not — an expired or rejected API token, an
 * exhausted balance, an account-level rate limit. It exists because these
 * failures are indistinguishable from per-profile ones at the call site and
 * produce N identical errors, one per profile, which is exactly how a
 * whole-platform outage hides in a log.
 *
 * Real case: on 2026-08-22 the Bright Data token stopped authenticating and
 * every Facebook scrape 401'd. All 32 Facebook profiles were stamped `failed`
 * once a day for twelve days. Nothing alerted, because from the loop's point of
 * view it looked like 32 unrelated broken profiles.
 */
export type ScrapeErrorScope = 'profile' | 'platform';

export class ScrapeError extends Error {
  public readonly status: ScrapeStatusCode;
  public readonly platform: string;
  public readonly profileUrl: string;
  /** True for transient upstream failures (network, 5xx, flaky 400) that a
   *  caller may safely retry. Deterministic failures (auth, billing, 404,
   *  private) stay false so retries don't mask real breakage. */
  public readonly retryable: boolean;
  /** See ScrapeErrorScope. Defaults to 'profile' — a new error type has to opt
   *  in to being platform-wide, so nothing becomes loud by accident. */
  public readonly scope: ScrapeErrorScope;

  constructor(
    status: ScrapeStatusCode,
    message: string,
    platform: string,
    profileUrl: string,
    retryable = false,
    scope: ScrapeErrorScope = 'profile',
  ) {
    super(`[${platform}] ${message}`);
    this.name = 'ScrapeError';
    this.status = status;
    this.platform = platform;
    this.profileUrl = profileUrl;
    this.retryable = retryable;
    this.scope = scope;
  }
}

/** Narrowing helper for callers that only care about the whole-platform case. */
export function isPlatformOutage(err: unknown): err is ScrapeError {
  return err instanceof ScrapeError && err.scope === 'platform';
}

export class ApifyTimeoutError extends ScrapeError {
  constructor(platform: string, profileUrl: string) {
    super('failed', 'Upstream scraper run timed out', platform, profileUrl);
    this.name = 'ApifyTimeoutError';
  }
}

export class ApifyEmptyResultError extends ScrapeError {
  constructor(platform: string, profileUrl: string) {
    super(
      'failed',
      'Upstream scraper returned no results — likely upstream breakage or invalid URL',
      platform,
      profileUrl,
    );
    this.name = 'ApifyEmptyResultError';
  }
}

export class ApifyThrottledError extends ScrapeError {
  constructor(platform: string, profileUrl: string) {
    super(
      'throttled',
      'Upstream rate-limited the request',
      platform,
      profileUrl,
    );
    this.name = 'ApifyThrottledError';
  }
}

export class ProfilePrivateError extends ScrapeError {
  constructor(platform: string, profileUrl: string) {
    super(
      'private',
      'Profile is private — make it public to track',
      platform,
      profileUrl,
    );
    this.name = 'ProfilePrivateError';
  }
}

export class ProfileNotFoundError extends ScrapeError {
  constructor(platform: string, profileUrl: string) {
    super(
      'not_found',
      'Profile not found — URL may be invalid or account deleted',
      platform,
      profileUrl,
    );
    this.name = 'ProfileNotFoundError';
  }
}
