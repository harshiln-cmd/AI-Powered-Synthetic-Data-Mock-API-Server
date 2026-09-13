import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { FastifyReply, FastifyRequest } from 'fastify';
import type { IApiConfigDocument } from '../../src/models/api-config.model';

// ---------------------------------------------------------------------------
// Mock only the route-registry lookup — the one real dependency this
// middleware has on shared, stateful application data. jsonSchemaToZod
// (from @mock-api-engine/schema) is deliberately NOT mocked: it's pure,
// synchronous, deterministic logic with no I/O, so using the real thing
// verifies actual request bodies are actually validated correctly, not just
// that some mock was called with the right arguments.
// ---------------------------------------------------------------------------

const { lookupRoute } = vi.hoisted(() => ({
  lookupRoute: vi.fn(),
}));

vi.mock('../../src/services/route-registry.service', () => ({ lookupRoute }));

import { validateMockRequest } from '../../src/middleware/validate-mock-request';

function fakeRequest(overrides: {
  method?: string;
  wildcard?: string;
  body?: unknown;
  query?: unknown;
}): FastifyRequest {
  return {
    method: overrides.method ?? 'GET',
    params: { '*': overrides.wildcard ?? 'api/users' },
    body: overrides.body,
    query: overrides.query ?? {},
    mockConfig: undefined,
  } as unknown as FastifyRequest;
}

function fakeReply(): FastifyReply & { code: ReturnType<typeof vi.fn>; send: ReturnType<typeof vi.fn> } {
  const reply = {
    code: vi.fn(),
    send: vi.fn(),
  };
  reply.code.mockReturnValue(reply);
  return reply as unknown as FastifyReply & { code: ReturnType<typeof vi.fn>; send: ReturnType<typeof vi.fn> };
}

function activeConfig(overrides: Partial<IApiConfigDocument> = {}): IApiConfigDocument {
  return {
    endpointName: '/api/users',
    httpMethod: 'GET',
    isActive: true,
    jsonSchema: {},
    ...overrides,
  } as unknown as IApiConfigDocument;
}

describe('validateMockRequest', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('responds 404 when no config is registered for the method+path', async () => {
    lookupRoute.mockReturnValue(undefined);
    const request = fakeRequest({ method: 'GET', wildcard: 'api/unknown' });
    const reply = fakeReply();

    await validateMockRequest(request, reply);

    expect(lookupRoute).toHaveBeenCalledWith('GET', '/api/unknown');
    expect(reply.code).toHaveBeenCalledWith(404);
    expect(reply.send).toHaveBeenCalledWith({
      error: 'Not Found',
      message: 'No mock endpoint registered for GET /api/unknown',
    });
    expect(request.mockConfig).toBeUndefined();
  });

  it('uppercases the HTTP method before looking it up, regardless of the incoming casing', async () => {
    lookupRoute.mockReturnValue(undefined);
    const request = fakeRequest({ method: 'get' });

    await validateMockRequest(request, fakeReply());

    expect(lookupRoute).toHaveBeenCalledWith('GET', expect.any(String));
  });

  it('extracts the endpoint name from the wildcard param, including nested segments', async () => {
    lookupRoute.mockReturnValue(undefined);
    const request = fakeRequest({ wildcard: 'api/users/123/orders' });

    await validateMockRequest(request, fakeReply());

    expect(lookupRoute).toHaveBeenCalledWith('GET', '/api/users/123/orders');
  });

  it('responds 404 when the config exists but is inactive', async () => {
    lookupRoute.mockReturnValue(activeConfig({ isActive: false }));
    const reply = fakeReply();

    await validateMockRequest(fakeRequest({}), reply);

    expect(reply.code).toHaveBeenCalledWith(404);
    expect(reply.send).toHaveBeenCalledWith(
      expect.objectContaining({ message: expect.stringContaining('currently inactive') })
    );
  });

  it('passes through with no reply sent when the config has no body/query schema at all', async () => {
    lookupRoute.mockReturnValue(activeConfig({ jsonSchema: {} }));
    const request = fakeRequest({});
    const reply = fakeReply();

    await validateMockRequest(request, reply);

    expect(reply.code).not.toHaveBeenCalled();
    expect(reply.send).not.toHaveBeenCalled();
    expect(request.mockConfig).toEqual(activeConfig({ jsonSchema: {} }));
  });

  it('falls back to the root path when the wildcard param is entirely absent', async () => {
    lookupRoute.mockReturnValue(undefined);
    // No '*' key at all, unlike fakeRequest()'s default — exercises the
    // `params['*'] ?? ''` fallback in extractEndpointName, not just a
    // present-but-already-matching value.
    const request = { method: 'GET', params: {}, body: undefined, query: {}, mockConfig: undefined } as unknown as FastifyRequest;

    await validateMockRequest(request, fakeReply());

    expect(lookupRoute).toHaveBeenCalledWith('GET', '/');
  });

  it('treats a config with no jsonSchema field at all as having no body/query rules to check', async () => {
    // Distinct from the "jsonSchema: {}" case above — this exercises the
    // `config.jsonSchema ?? {}` fallback itself, for a config object that
    // omits the field entirely.
    const config = activeConfig();
    delete (config as { jsonSchema?: unknown }).jsonSchema;
    lookupRoute.mockReturnValue(config);
    const request = fakeRequest({});
    const reply = fakeReply();

    await validateMockRequest(request, reply);

    expect(reply.send).not.toHaveBeenCalled();
    expect(request.mockConfig).toBe(config);
  });

  describe('body validation', () => {
    const bodySchema = {
      type: 'object' as const,
      required: ['name'],
      properties: { name: { type: 'string' as const } },
    };

    it('passes a body that satisfies the schema and attaches the config', async () => {
      const config = activeConfig({ jsonSchema: { body: bodySchema } });
      lookupRoute.mockReturnValue(config);
      const request = fakeRequest({ method: 'POST', body: { name: 'Ada' } });
      const reply = fakeReply();

      await validateMockRequest(request, reply);

      expect(reply.send).not.toHaveBeenCalled();
      expect(request.mockConfig).toBe(config);
    });

    it('responds 400 with location "body" and real Zod issues when the body fails validation', async () => {
      lookupRoute.mockReturnValue(activeConfig({ jsonSchema: { body: bodySchema } }));
      const request = fakeRequest({ method: 'POST', body: {} }); // missing required "name"
      const reply = fakeReply();

      await validateMockRequest(request, reply);

      expect(reply.code).toHaveBeenCalledWith(400);
      const [sentBody] = reply.send.mock.calls[0] as [{ error: string; location: string; issues: unknown[] }];
      expect(sentBody.error).toBe('Validation Error');
      expect(sentBody.location).toBe('body');
      expect(sentBody.issues.length).toBeGreaterThan(0);
      expect(request.mockConfig).toBeUndefined();
    });
  });

  describe('query validation', () => {
    const querySchema = {
      type: 'object' as const,
      required: ['page'],
      properties: { page: { type: 'string' as const } },
    };

    it('passes a query that satisfies the schema and attaches the config', async () => {
      const config = activeConfig({ jsonSchema: { query: querySchema } });
      lookupRoute.mockReturnValue(config);
      const request = fakeRequest({ query: { page: '2' } });
      const reply = fakeReply();

      await validateMockRequest(request, reply);

      expect(reply.send).not.toHaveBeenCalled();
      expect(request.mockConfig).toBe(config);
    });

    it('responds 400 with location "query" when the query fails validation', async () => {
      lookupRoute.mockReturnValue(activeConfig({ jsonSchema: { query: querySchema } }));
      const request = fakeRequest({ query: {} }); // missing required "page"
      const reply = fakeReply();

      await validateMockRequest(request, reply);

      expect(reply.code).toHaveBeenCalledWith(400);
      expect(reply.send).toHaveBeenCalledWith(expect.objectContaining({ location: 'query' }));
    });
  });

  it('checks body before query and short-circuits on a body failure (query is never evaluated)', async () => {
    lookupRoute.mockReturnValue(
      activeConfig({
        jsonSchema: {
          body: { type: 'object', required: ['name'], properties: { name: { type: 'string' } } },
          // Also invalid, so if query were checked first (or at all) the
          // response would report "query", not "body".
          query: { type: 'object', required: ['page'], properties: { page: { type: 'string' } } },
        },
      })
    );
    const request = fakeRequest({ method: 'POST', body: {}, query: {} });
    const reply = fakeReply();

    await validateMockRequest(request, reply);

    expect(reply.send).toHaveBeenCalledWith(expect.objectContaining({ location: 'body' }));
    expect(reply.send).toHaveBeenCalledTimes(1);
  });
});
