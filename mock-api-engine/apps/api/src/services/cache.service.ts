import { Redis } from 'ioredis';
import { createHash } from 'node:crypto';

const REDIS_URL = process.env.REDIS_URL ?? 'redis://localhost:6379';
const DEFAULT_TTL_SECONDS = Number(process.env.CACHE_TTL_SECONDS ?? 3600); // 1 hour
// Failure caching gets a much shorter TTL than a real AI-generated payload:
// long enough that a flaky/rate-limited AI provider doesn't get hammered by
// every request on a hot path, short enough that we retry AI again soon
// after it recovers instead of serving Faker fallbacks for a full hour.
export const FALLBACK_TTL_SECONDS = Number(process.env.FALLBACK_CACHE_TTL_SECONDS ?? 30);

export const redisClient = new Redis(REDIS_URL, {
  maxRetriesPerRequest: 2,
  lazyConnect: true, // connectToCache() below controls when we actually dial out
});

redisClient.on('error', (error: Error) => {
  // eslint-disable-next-line no-console
  console.error('[cache] redis client error:', error.message);
});

/**
 * Called once at boot. Unlike Mongo, a failed Redis connection is NOT fatal
 * — caching is a latency/cost optimization, not a correctness requirement.
 * If Redis is unreachable, every request just falls through to the AI/
 * fallback path on every call instead of being cached; the server still
 * serves correct responses, just slower.
 */
export async function connectToCache(): Promise<void> {
  try {
    await redisClient.connect();
    await redisClient.ping();
    // eslint-disable-next-line no-console
    console.log('[cache] connected to Redis');
  } catch (error) {
    // eslint-disable-next-line no-console
    console.warn('[cache] could not connect to Redis at boot — continuing without caching:', (error as Error).message);
  }
}

function hashPayload(payload: unknown): string {
  const serialized = JSON.stringify(payload ?? {});
  return createHash('sha256').update(serialized).digest('hex').slice(0, 16);
}

/**
 * One cache entry per (method, endpoint, request body, request query).
 * Hashing body/query means two different request payloads to the same mock
 * endpoint can be cached separately, at the cost of a lower hit rate for
 * endpoints that see highly varied bodies/queries — a deliberate trade-off
 * per your Step 2 spec rather than caching one payload per endpoint.
 */
export function buildCacheKey(
  httpMethod: string,
  endpointName: string,
  requestBody?: unknown,
  requestQuery?: unknown
): string {
  const hasBody = isNonEmptyObject(requestBody);
  const hasQuery = isNonEmptyObject(requestQuery);
  const bodyPart = hasBody ? hashPayload(requestBody) : 'nobody';
  const queryPart = hasQuery ? hashPayload(requestQuery) : 'noquery';
  return `mock:${httpMethod.toUpperCase()}:${endpointName}:${bodyPart}:${queryPart}`;
}

function isNonEmptyObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && Object.keys(value).length > 0;
}

/** Fails open: a broken/unreachable cache is treated as a miss, never an error. */
export async function getCachedPayload<T = unknown>(key: string): Promise<T | null> {
  if (redisClient.status !== 'ready') return null;
  try {
    const raw = await redisClient.get(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('[cache] get failed, treating as a miss:', (error as Error).message);
    return null;
  }
}

/** Fails silently (non-fatal): losing a cache write should never break the response already being sent to the client. */
export async function setCachedPayload(key: string, payload: unknown, ttlSeconds: number = DEFAULT_TTL_SECONDS): Promise<void> {
  if (redisClient.status !== 'ready') return;
  try {
    await redisClient.set(key, JSON.stringify(payload), 'EX', ttlSeconds);
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('[cache] set failed (non-fatal):', (error as Error).message);
  }
}
