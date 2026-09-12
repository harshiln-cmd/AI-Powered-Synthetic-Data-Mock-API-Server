import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';
import supertest from 'supertest';
import type { IApiConfigDocument } from '../../src/models/api-config.model';

// ---------------------------------------------------------------------------
// Mocks — Redis, the AI service, and the Faker fallback are all swapped for
// vi.fn() spies so the suite runs with zero live infra (no Docker, no Mongo,
// no Redis, no OpenAI credentials).
// ---------------------------------------------------------------------------

const {
  getCachedPayload,
  setCachedPayload,
  buildCacheKey,
  generateSyntheticPayload,
  generateFallbackPayload,
  FALLBACK_TTL_SECONDS,
} = vi.hoisted(() => ({
  getCachedPayload: vi.fn(),
  setCachedPayload: vi.fn(),
  buildCacheKey: vi.fn(),
  generateSyntheticPayload: vi.fn(),
  generateFallbackPayload: vi.fn(),
  FALLBACK_TTL_SECONDS: 30,
}));

vi.mock('../../src/services/cache.service', () => ({
  getCachedPayload,
  setCachedPayload,
  buildCacheKey,
  FALLBACK_TTL_SECONDS,
}));

vi.mock('../../src/services/ai.service', () => ({
  generateSyntheticPayload,
}));

vi.mock('../../src/services/fallback.service', () => ({
  generateFallbackPayload,
}));

// Imported after the mocks above so the controller resolves the mocked
// services rather than the real Redis/Mongo/OpenAI-backed implementations.
import { handleMockRequest } from '../../src/controllers/mock.controller';

// If the app already augments FastifyRequest with `mockConfig` elsewhere
// (e.g. in the real validateMockRequest middleware/types file), this
// declaration merges harmlessly with it — remove it here if that causes a
// duplicate-property conflict in your actual tsconfig project references.
declare module 'fastify' {
  interface FastifyRequest {
    mockConfig?: IApiConfigDocument;
  }
}

const FAKE_CONFIG = {
  endpointName: '/users/:id',
  httpMethod: 'GET',
  jsonSchema: {
    response: {
      type: 'object',
      properties: {
        id: { type: 'string' },
        email: { type: 'string' },
      },
    },
  },
} as unknown as IApiConfigDocument;

/**
 * Minimal stand-in for the real dynamic-route server. It skips schema
 * registration and the real `validateMockRequest` middleware entirely and
 * just decorates `request.mockConfig` directly — `handleMockRequest` only
 * cares that the field is populated (or intentionally left undefined, for
 * the defensive 500 case) by the time it runs.
 *
 * async + awaiting app.ready(): Fastify boots asynchronously (route/hook
 * registration goes through avvio internally), and supertest(app.server)
 * talks to the underlying raw HTTP server directly — it has no way to know
 * Fastify isn't finished booting yet. Skipping this ready() wait let requests
 * race ahead of hook registration, surfacing as an opaque "Cannot read
 * properties of undefined (reading 'length')" thrown from inside Fastify's
 * own preParsingHookRunner, not from anything in this test file or the
 * controller under test.
 */
async function buildTestApp(config: IApiConfigDocument | undefined): Promise<FastifyInstance> {
  const app = Fastify({ logger: false });

  app.addHook('onRequest', async (request) => {
    request.mockConfig = config;
  });

  app.get('/api/v1/mock/*', handleMockRequest);
  app.post('/api/v1/mock/*', handleMockRequest);

  await app.ready();
  return app;
}

describe('mock.controller — handleMockRequest', () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    vi.clearAllMocks();
    buildCacheKey.mockReturnValue('GET:/users/:id:{}:{}');
    app = await buildTestApp(FAKE_CONFIG);
  });

  afterEach(async () => {
    await app.close();
  });

  it('cache miss → AI failure falls back to the Faker service and flags the response', async () => {
    getCachedPayload.mockResolvedValueOnce(null);
    generateSyntheticPayload.mockRejectedValueOnce(new Error('AI request failed'));
    const fallbackPayload = { id: 'usr_fallback', email: 'fallback@example.com' };
    generateFallbackPayload.mockReturnValueOnce(fallbackPayload);
    setCachedPayload.mockResolvedValueOnce(undefined);

    const response = await supertest(app.server).get('/api/v1/mock/users/123');

    expect(response.status).toBe(200);
    expect(response.body).toEqual(fallbackPayload);
    expect(response.headers['x-mock-cache']).toBe('MISS');
    expect(response.headers['x-mock-fallback']).toBe('True');

    // Fallback data must be cached with the short TTL, not the default one.
    expect(setCachedPayload).toHaveBeenCalledWith(
      'GET:/users/:id:{}:{}',
      { payload: fallbackPayload, isFallback: true },
      FALLBACK_TTL_SECONDS
    );
  });

  it('cache miss → successful AI generation caches the payload without the fallback flag', async () => {
    getCachedPayload.mockResolvedValueOnce(null);
    const aiPayload = { id: 'usr_ai', email: 'ai-generated@example.com' };
    generateSyntheticPayload.mockResolvedValueOnce(aiPayload);
    setCachedPayload.mockResolvedValueOnce(undefined);

    const response = await supertest(app.server).get('/api/v1/mock/users/123');

    expect(response.status).toBe(200);
    expect(response.body).toEqual(aiPayload);
    expect(response.headers['x-mock-cache']).toBe('MISS');
    expect(response.headers['x-mock-fallback']).toBeUndefined();
    expect(generateFallbackPayload).not.toHaveBeenCalled();
    expect(setCachedPayload).toHaveBeenCalledWith(
      'GET:/users/:id:{}:{}',
      { payload: aiPayload, isFallback: false },
      undefined
    );
  });

  it('cache hit returns the cached payload with X-Mock-Cache: HIT and skips generation entirely', async () => {
    const cachedPayload = { id: 'usr_cached', email: 'cached@example.com' };
    getCachedPayload.mockResolvedValueOnce({ payload: cachedPayload, isFallback: false });

    const response = await supertest(app.server).get('/api/v1/mock/users/123');

    expect(response.status).toBe(200);
    expect(response.body).toEqual(cachedPayload);
    expect(response.headers['x-mock-cache']).toBe('HIT');
    expect(response.headers['x-mock-fallback']).toBeUndefined();

    expect(generateSyntheticPayload).not.toHaveBeenCalled();
    expect(generateFallbackPayload).not.toHaveBeenCalled();
    expect(setCachedPayload).not.toHaveBeenCalled();
  });

  it('cache hit on previously-fallback data still surfaces X-Mock-Fallback: True', async () => {
    const cachedPayload = { id: 'usr_stale_fallback', email: 'stale@example.com' };
    getCachedPayload.mockResolvedValueOnce({ payload: cachedPayload, isFallback: true });

    const response = await supertest(app.server).get('/api/v1/mock/users/123');

    expect(response.headers['x-mock-cache']).toBe('HIT');
    expect(response.headers['x-mock-fallback']).toBe('True');
  });

  it('returns a 500 with a generic message when mockConfig is missing (defensive path)', async () => {
    app = await buildTestApp(undefined);

    const response = await supertest(app.server).get('/api/v1/mock/users/123');

    expect(response.status).toBe(500);
    expect(response.body).toEqual({
      error: 'Internal Server Error',
      message: 'mockConfig missing after validation',
    });
    expect(getCachedPayload).not.toHaveBeenCalled();
  });

  it('returns a generic 500 (not the fallback path) on a genuinely unexpected failure', async () => {
    getCachedPayload.mockRejectedValueOnce(new Error('Redis ECONNREFUSED'));

    const response = await supertest(app.server).get('/api/v1/mock/users/123');

    expect(response.status).toBe(500);
    expect(response.body.message).toMatch(/unexpected failure/i);
    expect(generateFallbackPayload).not.toHaveBeenCalled();
  });
});
