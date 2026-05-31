/**
 * Shared, FAIL-OPEN rate limiter. Extracted from proxy-image so paid/expensive
 * endpoints (e.g. /api/scrape) can throttle abuse with one call. Inert when
 * UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN are unset (local dev). If the
 * limiter THROWS (bad token / Redis down) we fail OPEN — a limiter outage must
 * never take an endpoint down. (Also the fix proxy-image should adopt: today its
 * limiter is fail-closed, so a bad token 500s every request.)
 */
import { Ratelimit } from '@upstash/ratelimit';
import { Redis } from '@upstash/redis';

// e.g. '10 s' | '1 m' | '24 h' — matches @upstash/ratelimit's Duration shape.
type Window = `${number} ${'ms' | 's' | 'm' | 'h' | 'd'}`;

export type RateLimitResult = { ok: true } | { ok: false; retryAfter: number };

// One limiter per (prefix) reused across warm invocations. Keep prefixes unique
// per config — tokens/window are baked into the first instance for a prefix.
const limiters = new Map<string, Ratelimit>();

function getLimiter(prefix: string, tokens: number, window: Window): Ratelimit | null {
  if (!process.env.UPSTASH_REDIS_REST_URL || !process.env.UPSTASH_REDIS_REST_TOKEN) {
    return null;
  }
  const cached = limiters.get(prefix);
  if (cached) return cached;
  const limiter = new Ratelimit({
    redis: Redis.fromEnv(),
    limiter: Ratelimit.slidingWindow(tokens, window),
    analytics: false,
    prefix,
  });
  limiters.set(prefix, limiter);
  return limiter;
}

export async function checkRateLimit(opts: {
  prefix: string;
  key: string;
  tokens: number;
  window: Window;
}): Promise<RateLimitResult> {
  const limiter = getLimiter(opts.prefix, opts.tokens, opts.window);
  if (!limiter) return { ok: true }; // not configured → no-op
  try {
    const { success, reset } = await limiter.limit(opts.key);
    if (success) return { ok: true };
    return { ok: false, retryAfter: Math.max(0, Math.ceil((reset - Date.now()) / 1000)) };
  } catch {
    return { ok: true }; // fail OPEN — never block on a limiter error
  }
}
