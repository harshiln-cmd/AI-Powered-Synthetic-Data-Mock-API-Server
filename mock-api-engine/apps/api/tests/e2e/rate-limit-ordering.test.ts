import { describe, it, expect, vi, beforeEach } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';
import type { IApiConfigDocument } from '../../src/models/api-config.model';
import type { IApiKeyDocument } from '../../src/models/api-key.model';

// ---------------------------------------------------------------------------
// This test exists specifically to prove the ordering guarantee requested:
// "put the rate-limiting middleware before your AI generation logic, so you
// don't accidentally pay for OpenAI tokens on blocked requests." Everything
// below is mocked EXCEPT the real mock.routes.ts wiring and the real
// rateLimitGuard/validateMockRequest/handleMockRequest chain — this is what
// actually proves the guarantee, rather than just asserting it in a comment.
// ---------------------------------------------------------------------------

const { lookupApiKeyByRawKey, incrementAndCheckRateLimit, incrementMonthlyUsage, lookupRoute, generateSyntheticPayload } =
  vi.hoisted(() => ({
    lookupApiKeyByRawKey: vi.fn(),
    incrementAndCheckRateLimit: vi.fn(),
    incrementMonthlyUsage: vi.fn(),
    lookupRoute: vi.fn(),
    generateSyntheticPayload: vi.fn(),
  }));

vi.mock('../../src/services/api-key.service', () => ({ lookupApiKeyByRawKey }));
vi.mock('../../src/services/rate-limit.service', () => ({ incrementAndCheckRateLimit, incrementMonthlyUsage }));
vi.mock('../../src/services/route-registry.service', () => ({ lookupRoute }));
vi.mock('../../src/services/ai.service', () => ({ generateSyntheticPayload }));
vi.mock('../../src/services/cache.service', () => ({
  getCachedPayload: vi.fn().mockResolvedValue(null),
  setCachedPayload: vi.fn().mockResolvedValue(undefined),
  buildCacheKey: vi.fn().mockReturnValue('mock:GET:/api/users:nobody:noquery'),
  FALLBACK_TTL_SECONDS: 30,
}));
vi.mock('../../src/services/fallback.service', () => ({ generateFallbackPayload: vi.fn().mockReturnValue({}) }));

import { mockRoutes } from '../../src/routes/mock.routes';

function fakeApiKeyDoc(overrides: Partial<IApiKeyDocument> = {}): IApiKeyDocument {
  return { keyHash: 'hash-abc', tier: 'free', isActive: true, ...overrides } as unknown as IApiKeyDocument;
}

function fakeRouteConfig(): IApiConfigDocument {
  return {
    endpointName: '/api/users',
    httpMethod: 'GET',
    isActive: true,
    jsonSchema: { response: { type: 'object', properties: {} } },
  } as unknown as IApiConfigDocument;
}

async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify({ logger: false });
  await app.register(mockRoutes);
  await app.ready();
  return app;
}

describe('mock.routes ordering — rate limit before AI generation', () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    vi.clearAllMocks();
    incrementMonthlyUsage.mockResolvedValue(1);
    lookupRoute.mockReturnValue(fakeRouteConfig());
    app = await buildApp();
  });

  it('never calls the AI generation function when the x-api-key header is missing', async () => {
    const response = await app.inject({ method: 'GET', url: '/api/v1/mock/api/users' });

    expect(response.statusCode).toBe(401);
    expect(lookupRoute).not.toHaveBeenCalled();
    expect(generateSyntheticPayload).not.toHaveBeenCalled();
  });

  it('never calls the AI generation function when the API key is invalid', async () => {
    lookupApiKeyByRawKey.mockResolvedValueOnce(null);

    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/mock/api/users',
      headers: { 'x-api-key': 'mk_live_invalid' },
    });

    expect(response.statusCode).toBe(401);
    expect(generateSyntheticPayload).not.toHaveBeenCalled();
  });

  it('never calls the AI generation function when the rate limit is exceeded', async () => {
    lookupApiKeyByRawKey.mockResolvedValueOnce(fakeApiKeyDoc());
    incrementAndCheckRateLimit.mockResolvedValueOnce({ allowed: false, count: 51, limit: 50, retryAfterSeconds: 30 });

    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/mock/api/users',
      headers: { 'x-api-key': 'mk_live_over_limit' },
    });

    expect(response.statusCode).toBe(429);
    // The key assertion: schema/route lookup and AI generation genuinely
    // never ran for this request.
    expect(lookupRoute).not.toHaveBeenCalled();
    expect(generateSyntheticPayload).not.toHaveBeenCalled();
  });

  it('reaches AI generation only once rate limiting and schema validation both pass', async () => {
    lookupApiKeyByRawKey.mockResolvedValueOnce(fakeApiKeyDoc());
    incrementAndCheckRateLimit.mockResolvedValueOnce({ allowed: true, count: 1, limit: 50, retryAfterSeconds: 60 });
    generateSyntheticPayload.mockResolvedValueOnce({ id: '1' });

    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/mock/api/users',
      headers: { 'x-api-key': 'mk_live_valid' },
    });

    expect(response.statusCode).toBe(200);
    expect(generateSyntheticPayload).toHaveBeenCalledTimes(1);
  });
});
