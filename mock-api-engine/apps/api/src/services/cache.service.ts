import { Redis } from 'ioredis';
import { createHash } from 'node:crypto';

const REDIS_URL = process.env.REDIS_URL ?? 'redis://localhost:6379';
const DEFAULT_TTL_SECONDS = Number(process.env.CACHE_TTL_SECONDS ?? 3600);
export const FALLBACK_TTL_SECONDS = Number(process.env.FALLBACK_CACHE_TTL_SECONDS ?? 30);

export const redisClient = new Redis(REDIS_URL, {
  maxRetriesPerRequest: 2,
  lazyConnect: true,
});

redisClient.on('error', (error: Error) => {
  console.error('[cache] redis client error:', error.message);
});

export async function connectToCache(): Promise<void> {
  try {
    await redisClient.connect();
    await redisClient.ping();
    console.log('[cache] connected to Redis');
  } catch (error) {
    console.warn('[cache] could not connect to Redis at boot — continuing without caching:', (error as Error).message);
  }
}

// Both call sites below guard with isNonEmptyObject() first, which already
// guarantees a non-null object — no defensive fallback needed here.
function hashPayload(payload: unknown): string {
  const serialized = JSON.stringify(payload);
  return createHash('sha256').update(serialized).digest('hex').slice(0, 16);
}

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

export async function getCachedPayload<T = unknown>(key: string): Promise<T | null> {
  if (redisClient.status !== 'ready') return null;
  try {
    const raw = await redisClient.get(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch (error) {
    console.error('[cache] get failed, treating as a miss:', (error as Error).message);
    return null;
  }
}

export async function setCachedPayload(key: string, payload: unknown, ttlSeconds: number = DEFAULT_TTL_SECONDS): Promise<void> {
  if (redisClient.status !== 'ready') return;
  try {
    await redisClient.set(key, JSON.stringify(payload), 'EX', ttlSeconds);
  } catch (error) {
    console.error('[cache] set failed (non-fatal):', (error as Error).message);
  }
}
