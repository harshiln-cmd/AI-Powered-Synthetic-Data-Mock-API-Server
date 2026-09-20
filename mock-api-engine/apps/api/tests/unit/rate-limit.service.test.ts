import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';

process.env.REDIS_URL = 'redis://localhost:6379';

import { redisClient, connectToCache } from '../../src/services/cache.service';
import {
  incrementAndCheckRateLimit,
  incrementMonthlyUsage,
  getMonthlyUsage,
  startOfNextMonthIso,
} from '../../src/services/rate-limit.service';

// Real Redis, not mocked: the thing actually worth verifying here is
// atomicity and window-boundary behavior, which a mock would just assume
// away. Requires a local redis-server on 6379 — skip/adjust REDIS_URL above
// if running this elsewhere.

let testCounter = 0;
function uniqueKeyHash(): string {
  testCounter += 1;
  return `test-key-hash-${Date.now()}-${testCounter}`;
}

beforeAll(async () => {
  await connectToCache();
});

afterAll(async () => {
  await redisClient.quit();
});

afterEach(async () => {
  const keys = await redisClient.keys('ratelimit:test-key-hash-*');
  const usageKeys = await redisClient.keys('usage:test-key-hash-*');
  const allKeys = [...keys, ...usageKeys];
  if (allKeys.length > 0) {
    await redisClient.del(...allKeys);
  }
});

describe('rate-limit.service (real Redis)', () => {
  describe('incrementAndCheckRateLimit', () => {
    it('allows the first request in a fresh window', async () => {
      const result = await incrementAndCheckRateLimit(uniqueKeyHash(), 5);

      expect(result.allowed).toBe(true);
      expect(result.count).toBe(1);
      expect(result.limit).toBe(5);
    });

    it('increments on each call within the same window', async () => {
      const keyHash = uniqueKeyHash();

      const first = await incrementAndCheckRateLimit(keyHash, 5);
      const second = await incrementAndCheckRateLimit(keyHash, 5);
      const third = await incrementAndCheckRateLimit(keyHash, 5);

      expect([first.count, second.count, third.count]).toEqual([1, 2, 3]);
    });

    it('denies once the count exceeds the limit', async () => {
      const keyHash = uniqueKeyHash();
      const limit = 3;

      const results = [];
      for (let i = 0; i < 5; i++) {
        results.push(await incrementAndCheckRateLimit(keyHash, limit));
      }

      expect(results.map((r) => r.allowed)).toEqual([true, true, true, false, false]);
      expect(results.map((r) => r.count)).toEqual([1, 2, 3, 4, 5]);
    });

    it('tracks different keys independently', async () => {
      const keyA = uniqueKeyHash();
      const keyB = uniqueKeyHash();

      await incrementAndCheckRateLimit(keyA, 5);
      await incrementAndCheckRateLimit(keyA, 5);
      const resultB = await incrementAndCheckRateLimit(keyB, 5);

      expect(resultB.count).toBe(1); // unaffected by keyA's two increments
    });

    it('sets a TTL on the first request in a window and does not reset it on later requests', async () => {
      const keyHash = uniqueKeyHash();

      await incrementAndCheckRateLimit(keyHash, 5);
      const ttlAfterFirst = await redisClient.ttl(`ratelimit:${keyHash}:${Math.floor(Date.now() / 60000)}`);
      expect(ttlAfterFirst).toBeGreaterThan(0);
      expect(ttlAfterFirst).toBeLessThanOrEqual(60);

      await new Promise((resolve) => setTimeout(resolve, 1100));
      await incrementAndCheckRateLimit(keyHash, 5);
      const ttlAfterSecond = await redisClient.ttl(`ratelimit:${keyHash}:${Math.floor(Date.now() / 60000)}`);

      // If EXPIRE were called again on the second request, this would jump
      // back up near 60. It should instead have kept counting down from the
      // first call's TTL.
      expect(ttlAfterSecond).toBeLessThan(ttlAfterFirst);
    });

    it('returns a positive, bounded retryAfterSeconds', async () => {
      const result = await incrementAndCheckRateLimit(uniqueKeyHash(), 1);

      expect(result.retryAfterSeconds).toBeGreaterThan(0);
      expect(result.retryAfterSeconds).toBeLessThanOrEqual(60);
    });
  });

  describe('monthly usage tracking', () => {
    it('reports 0 usage for a key that has never made a request', async () => {
      expect(await getMonthlyUsage(uniqueKeyHash())).toBe(0);
    });

    it('increments and is reflected by getMonthlyUsage', async () => {
      const keyHash = uniqueKeyHash();

      await incrementMonthlyUsage(keyHash);
      await incrementMonthlyUsage(keyHash);
      const third = await incrementMonthlyUsage(keyHash);

      expect(third).toBe(3);
      expect(await getMonthlyUsage(keyHash)).toBe(3);
    });

    it('tracks separate keys independently', async () => {
      const keyA = uniqueKeyHash();
      const keyB = uniqueKeyHash();

      await incrementMonthlyUsage(keyA);
      await incrementMonthlyUsage(keyA);
      await incrementMonthlyUsage(keyB);

      expect(await getMonthlyUsage(keyA)).toBe(2);
      expect(await getMonthlyUsage(keyB)).toBe(1);
    });
  });

  describe('startOfNextMonthIso', () => {
    it('returns an ISO timestamp strictly in the future', () => {
      const result = startOfNextMonthIso();

      expect(new Date(result).getTime()).toBeGreaterThan(Date.now());
    });

    it('always lands on the 1st of a month at midnight UTC', () => {
      const result = new Date(startOfNextMonthIso());

      expect(result.getUTCDate()).toBe(1);
      expect(result.getUTCHours()).toBe(0);
      expect(result.getUTCMinutes()).toBe(0);
    });
  });
});
