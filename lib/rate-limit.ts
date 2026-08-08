/**
 * Minimal in-memory rate limiter — fine for a single server instance, but
 * the counters live in process memory: they reset on deploy/restart and
 * don't share state across multiple instances/regions. Once this app runs
 * on more than one server, swap this for Upstash Redis
 * (`@upstash/ratelimit` + `@upstash/redis`) using the same `check()`
 * signature so call sites below don't need to change.
 */

type Bucket = { count: number; resetAt: number };
const buckets = new Map<string, Bucket>();

export function checkRateLimit(key: string, limit: number, windowMs: number): { allowed: boolean; remaining: number } {
  const now = Date.now();
  const bucket = buckets.get(key);

  if (!bucket || bucket.resetAt < now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return { allowed: true, remaining: limit - 1 };
  }

  if (bucket.count >= limit) {
    return { allowed: false, remaining: 0 };
  }

  bucket.count += 1;
  return { allowed: true, remaining: limit - bucket.count };
}

// Suggested limits for the auth-adjacent endpoints most worth protecting:
//   login attempts:   5 requests / 5 minutes  per email+IP
//   signup:           5 requests / hour       per IP
//   coupon validate:  20 requests / minute    per IP  (guards against code-guessing)
//   OTP send/verify:  5 requests / 10 minutes per phone number
