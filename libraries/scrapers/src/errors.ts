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

export class ScrapeError extends Error {
  public readonly status: ScrapeStatusCode;
  public readonly platform: string;
  public readonly profileUrl: string;
  /** True for transient upstream failures (network, 5xx, flaky 400) that a
   *  caller may safely retry. Deterministic failures (auth, billing, 404,
   *  private) stay false so retries don't mask real breakage. */
  public readonly retryable: boolean;

  constructor(
    status: ScrapeStatusCode,
    message: string,
    platform: string,
    profileUrl: string,
    retryable = false,
  ) {
    super(`[${platform}] ${message}`);
    this.name = 'ScrapeError';
    this.status = status;
    this.platform = platform;
    this.profileUrl = profileUrl;
    this.retryable = retryable;
  }
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
