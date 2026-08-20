/**
 * Simple in-memory sliding-window rate limiter.
 *
 * This is intentionally lightweight: the app is designed to run as a single
 * local instance (see README "local-only warning"), so an in-process Map is
 * sufficient. It would NOT be appropriate for a multi-instance or public
 * deployment, which is explicitly out of scope for this project.
 */
interface Bucket {
  count: number;
  windowStart: number;
}

const buckets = new Map<string, Bucket>();

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  retryAfterMs: number;
}

export function checkRateLimit(
  key: string,
  { max, windowMs }: { max: number; windowMs: number },
): RateLimitResult {
  const now = Date.now();
  const existing = buckets.get(key);

  if (!existing || now - existing.windowStart >= windowMs) {
    buckets.set(key, { count: 1, windowStart: now });
    return { allowed: true, remaining: max - 1, retryAfterMs: 0 };
  }

  if (existing.count >= max) {
    return {
      allowed: false,
      remaining: 0,
      retryAfterMs: windowMs - (now - existing.windowStart),
    };
  }

  existing.count += 1;
  return { allowed: true, remaining: max - existing.count, retryAfterMs: 0 };
}

/** Periodically evicts stale buckets so this Map cannot grow unbounded. */
export function pruneRateLimitBuckets(maxAgeMs: number): void {
  const now = Date.now();
  for (const [key, bucket] of buckets) {
    if (now - bucket.windowStart > maxAgeMs) buckets.delete(key);
  }
}

export function __resetRateLimitForTests(): void {
  buckets.clear();
}
