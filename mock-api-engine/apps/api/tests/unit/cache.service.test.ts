import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createHash } from 'node:crypto';

// ---------------------------------------------------------------------------
// Mock ioredis. `vi.hoisted` is required here (rather than a plain top-level
// const) because vi.mock factories are hoisted above imports, and
// cache.service.ts calls `new Redis(...)` at module scope — the mock
// instance has to exist before that import executes.
// ---------------------------------------------------------------------------

const { mockRedisInstance } = vi.hoisted(() => {
  return {
    mockRedisInstance: {
      status: 'wait' as string,
      connect: vi.fn(),
      ping: vi.fn(),
      get: vi.fn(),
      set: vi.fn(),
      on: vi.fn(),
    },
  };
});

vi.mock('ioredis', () => ({
  // Same class of bug as ai.service.test.ts: an arrow function has no
  // [[Construct]], so `new Redis(...)` in cache.service.ts throws "is not a
  // constructor" immediately. A `function` that explicitly `return`s an
  // object is constructible, and per JS's constructor semantics that
  // explicit return value replaces the `this` `new` would otherwise have
  // produced — so `new Redis(...)` now correctly evaluates to
  // mockRedisInstance itself.
  Redis: vi.fn().mockImplementation(function () {
    return mockRedisInstance;
  }),
}));

import {
  connectToCache,
  buildCacheKey,
  getCachedPayload,
  setCachedPayload,
  FALLBACK_TTL_SECONDS,
} from '../../src/services/cache.service';

/** Mirrors the private `hashPayload()` in cache.service.ts so tests can
 * assert on the exact cache key without exporting an internal helper. */
function expectedHash(payload: unknown): string {
  return createHash('sha256').update(JSON.stringify(payload ?? {})).digest('hex').slice(0, 16);
}

// cache.service.ts reads this once at import time — reading it the same way
// here (rather than hardcoding 3600) keeps the test honest if CI ever sets
// CACHE_TTL_SECONDS explicitly.
const DEFAULT_TTL_SECONDS = Number(process.env.CACHE_TTL_SECONDS ?? 3600);

describe('cache.service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRedisInstance.status = 'wait';
  });

  describe('connectToCache', () => {
    it('connects and pings Redis on success, and never throws', async () => {
      mockRedisInstance.connect.mockResolvedValueOnce(undefined);
      mockRedisInstance.ping.mockResolvedValueOnce('PONG');
      const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      await expect(connectToCache()).resolves.toBeUndefined();

      expect(mockRedisInstance.connect).toHaveBeenCalledTimes(1);
      expect(mockRedisInstance.ping).toHaveBeenCalledTimes(1);
      expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('connected to Redis'));

      logSpy.mockRestore();
    });

    it('swallows a boot-time connection failure instead of throwing — caching is optional, not fatal', async () => {
      mockRedisInstance.connect.mockRejectedValueOnce(new Error('ECONNREFUSED'));
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      await expect(connectToCache()).resolves.toBeUndefined();

      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('could not connect to Redis at boot'),
        expect.any(String)
      );

      warnSpy.mockRestore();
    });
  });

  describe('buildCacheKey', () => {
    it('uses "nobody"/"noquery" placeholders when body and query are absent', () => {
      expect(buildCacheKey('get', '/users/:id')).toBe('mock:GET:/users/:id:nobody:noquery');
    });

    it('treats an empty object body/query the same as absent (no accidental hashing of {})', () => {
      expect(buildCacheKey('POST', '/users', {}, {})).toBe('mock:POST:/users:nobody:noquery');
    });

    it('hashes a non-empty body and query independently of each other', () => {
      const body = { name: 'Ada' };
      const query = { page: 2 };

      const key = buildCacheKey('post', '/users', body, query);

      expect(key).toBe(`mock:POST:/users:${expectedHash(body)}:${expectedHash(query)}`);
    });

    it('produces different keys for different bodies against the same endpoint', () => {
      const keyA = buildCacheKey('POST', '/users', { name: 'Ada' });
      const keyB = buildCacheKey('POST', '/users', { name: 'Grace' });

      expect(keyA).not.toBe(keyB);
    });

    it('produces the same key for structurally identical bodies (stable hashing)', () => {
      const keyA = buildCacheKey('POST', '/users', { name: 'Ada' });
      const keyB = buildCacheKey('POST', '/users', { name: 'Ada' });

      expect(keyA).toBe(keyB);
    });
  });

  describe('getCachedPayload', () => {
    it('returns null without touching Redis when the client is not ready', async () => {
      mockRedisInstance.status = 'wait';

      const result = await getCachedPayload('some-key');

      expect(result).toBeNull();
      expect(mockRedisInstance.get).not.toHaveBeenCalled();
    });

    it('returns null on a real cache miss (Redis has no value for the key)', async () => {
      mockRedisInstance.status = 'ready';
      mockRedisInstance.get.mockResolvedValueOnce(null);

      const result = await getCachedPayload('some-key');

      expect(result).toBeNull();
      expect(mockRedisInstance.get).toHaveBeenCalledWith('some-key');
    });

    it('returns the parsed JSON payload on a cache hit', async () => {
      mockRedisInstance.status = 'ready';
      const payload = { id: 'usr_1', isFallback: false };
      mockRedisInstance.get.mockResolvedValueOnce(JSON.stringify(payload));

      const result = await getCachedPayload<typeof payload>('some-key');

      expect(result).toEqual(payload);
    });

    it('fails open — returns null, never throws — when Redis errors on read', async () => {
      mockRedisInstance.status = 'ready';
      mockRedisInstance.get.mockRejectedValueOnce(new Error('READONLY'));
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      await expect(getCachedPayload('some-key')).resolves.toBeNull();
      expect(errorSpy).toHaveBeenCalled();

      errorSpy.mockRestore();
    });
  });

  describe('setCachedPayload', () => {
    it('does nothing when the client is not ready', async () => {
      mockRedisInstance.status = 'wait';

      await setCachedPayload('key', { a: 1 });

      expect(mockRedisInstance.set).not.toHaveBeenCalled();
    });

    it('writes with the default TTL when none is provided', async () => {
      mockRedisInstance.status = 'ready';
      mockRedisInstance.set.mockResolvedValueOnce('OK');
      const payload = { a: 1 };

      await setCachedPayload('key', payload);

      expect(mockRedisInstance.set).toHaveBeenCalledWith(
        'key',
        JSON.stringify(payload),
        'EX',
        DEFAULT_TTL_SECONDS
      );
    });

    it('writes with the short 30s fallback TTL when explicitly passed', async () => {
      mockRedisInstance.status = 'ready';
      mockRedisInstance.set.mockResolvedValueOnce('OK');
      const payload = { a: 1, isFallback: true };

      await setCachedPayload('key', payload, FALLBACK_TTL_SECONDS);

      expect(mockRedisInstance.set).toHaveBeenCalledWith(
        'key',
        JSON.stringify(payload),
        'EX',
        FALLBACK_TTL_SECONDS
      );
      // Guards the actual business rule, not just the wiring: fallback data
      // must expire well before a normal AI-generated entry would.
      expect(FALLBACK_TTL_SECONDS).toBeLessThan(DEFAULT_TTL_SECONDS);
    });

    it('fails silently — never throws — when Redis errors on write', async () => {
      mockRedisInstance.status = 'ready';
      mockRedisInstance.set.mockRejectedValueOnce(new Error('WRONGTYPE'));
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      await expect(setCachedPayload('key', { a: 1 })).resolves.toBeUndefined();
      expect(errorSpy).toHaveBeenCalled();

      errorSpy.mockRestore();
    });
  });
});
