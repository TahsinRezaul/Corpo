/**
 * In-memory sliding-window rate limiter.
 * Works for single-instance deployments (Vercel serverless per-region, Docker single container).
 * For multi-instance, swap the Map for an Upstash Redis store.
 */

type Entry = { count: number; resetAt: number };
const store = new Map<string, Entry>();

// Clean up expired entries every 5 minutes to prevent memory growth
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of store) {
    if (entry.resetAt < now) store.delete(key);
  }
}, 5 * 60 * 1000);

export type RateLimitConfig = {
  /** Max requests allowed in the window */
  limit: number;
  /** Window duration in seconds */
  windowSecs: number;
};

export type RateLimitResult = {
  allowed: boolean;
  remaining: number;
  resetAt: number; // Unix timestamp (ms)
};

export function rateLimit(
  key: string,
  { limit, windowSecs }: RateLimitConfig
): RateLimitResult {
  const now = Date.now();
  const windowMs = windowSecs * 1000;

  const entry = store.get(key);

  if (!entry || entry.resetAt < now) {
    // New window
    store.set(key, { count: 1, resetAt: now + windowMs });
    return { allowed: true, remaining: limit - 1, resetAt: now + windowMs };
  }

  if (entry.count >= limit) {
    return { allowed: false, remaining: 0, resetAt: entry.resetAt };
  }

  entry.count += 1;
  return { allowed: true, remaining: limit - entry.count, resetAt: entry.resetAt };
}

/** Extract the real client IP from a Next.js request */
export function getIP(req: Request): string {
  const forwarded = (req as { headers: { get(k: string): string | null } }).headers.get("x-forwarded-for");
  return (forwarded?.split(",")[0] ?? "unknown").trim();
}

// ── Pre-built limiters ─────────────────────────────────────────────────────────

/** Auth endpoints: 10 attempts per 15 minutes */
export const authLimit    = (ip: string) => rateLimit(`auth:${ip}`,    { limit: 10, windowSecs: 15 * 60 });

/** AI / expensive endpoints: 60 requests per minute */
export const aiLimit      = (ip: string) => rateLimit(`ai:${ip}`,      { limit: 60, windowSecs: 60 });

/** File upload endpoints: 20 uploads per minute */
export const uploadLimit  = (ip: string) => rateLimit(`upload:${ip}`,  { limit: 20, windowSecs: 60 });

/** Geocoding / Maps endpoints: 120 per minute */
export const mapsLimit    = (ip: string) => rateLimit(`maps:${ip}`,    { limit: 120, windowSecs: 60 });
