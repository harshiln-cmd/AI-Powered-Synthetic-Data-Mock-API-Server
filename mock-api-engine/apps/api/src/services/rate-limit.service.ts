import { redisClient } from './cache.service';

const WINDOW_SECONDS = 60;
// Comfortably outlives any single calendar month so a slightly-late cleanup
// never truncates a real month's data, while still self-expiring instead of
// accumulating keys forever.
const MONTHLY_USAGE_TTL_SECONDS = 60 * 60 * 24 * 35;

function currentWindowBucket(): number {
  return Math.floor(Date.now() / (WINDOW_SECONDS * 1000));
}

function currentMonthBucket(): string {
  const now = new Date();
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
}

export interface RateLimitResult {
  allowed: boolean;
  count: number;
  limit: number;
  retryAfterSeconds: number;
}

/**
 * Fixed-window counter, keyed to the wall-clock minute rather than "60s
 * after this key's first request" — every client sharing a window boundary
 * resets at the same moment.
 *
 * INCR is atomic on its own, so concurrent requests can't race each other
 * into under-counting. The part that needs care is the EXPIRE: it only runs
 * when count === 1 (i.e. this call just created the key). Verified this
 * empirically against real Redis — calling EXPIRE on every request would
 * keep pushing the TTL forward as long as traffic continues, turning a
 * fixed window into an accidental sliding one that never resets; gating it
 * on count === 1 means only the request that starts a window sets its
 * lifetime, and later requests in the same window leave that TTL alone.
 */
export async function incrementAndCheckRateLimit(keyHash: string, limit: number): Promise<RateLimitResult> {
  const bucket = currentWindowBucket();
  const redisKey = `ratelimit:${keyHash}:${bucket}`;

  const count = await redisClient.incr(redisKey);
  if (count === 1) {
    await redisClient.expire(redisKey, WINDOW_SECONDS);
  }

  const windowEndMs = (bucket + 1) * WINDOW_SECONDS * 1000;
  const retryAfterSeconds = Math.max(1, Math.ceil((windowEndMs - Date.now()) / 1000));

  return { allowed: count <= limit, count, limit, retryAfterSeconds };
}

/** Same INCR + conditional-EXPIRE pattern as above, on a calendar-month bucket instead of a 60s one — this is what the dashboard's usage stats read from. */
export async function incrementMonthlyUsage(keyHash: string): Promise<number> {
  const redisKey = `usage:${keyHash}:${currentMonthBucket()}`;
  const count = await redisClient.incr(redisKey);
  if (count === 1) {
    await redisClient.expire(redisKey, MONTHLY_USAGE_TTL_SECONDS);
  }
  return count;
}

export async function getMonthlyUsage(keyHash: string): Promise<number> {
  const redisKey = `usage:${keyHash}:${currentMonthBucket()}`;
  const raw = await redisClient.get(redisKey);
  return raw ? Number(raw) : 0;
}

export function startOfNextMonthIso(): string {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1, 0, 0, 0, 0)).toISOString();
}
