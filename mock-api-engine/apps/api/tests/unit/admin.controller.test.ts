import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { FastifyReply, FastifyRequest } from 'fastify';

// ---------------------------------------------------------------------------
// Mocks — ApiConfigModel is Mongoose (a real database dependency, must be
// mocked per the brief) and route-registry.service is mocked too so this
// suite verifies admin.controller's own contract with it (called with the
// right argument) in isolation from route-registry's own internal Map
// state, which has its own dedicated test file. CreateEndpointConfigSchema
// is deliberately real — it's pure Zod validation, not I/O.
// ---------------------------------------------------------------------------

const { findOne, create, registerInMemory, listRegisteredRoutes } = vi.hoisted(() => ({
  findOne: vi.fn(),
  create: vi.fn(),
  registerInMemory: vi.fn(),
  listRegisteredRoutes: vi.fn(),
}));

vi.mock('../../src/models/api-config.model', () => ({
  ApiConfigModel: { findOne, create },
}));

vi.mock('../../src/services/route-registry.service', () => ({
  registerInMemory,
  listRegisteredRoutes,
}));

import { createEndpointConfig, listEndpointConfigs } from '../../src/controllers/admin.controller';

function fakeRequest(body: unknown): FastifyRequest {
  return { body } as unknown as FastifyRequest;
}

function fakeReply(): FastifyReply & { code: ReturnType<typeof vi.fn>; send: ReturnType<typeof vi.fn> } {
  const reply = { code: vi.fn(), send: vi.fn() };
  reply.code.mockReturnValue(reply);
  return reply as unknown as FastifyReply & { code: ReturnType<typeof vi.fn>; send: ReturnType<typeof vi.fn> };
}

const VALID_INPUT = {
  endpointName: '/api/users',
  httpMethod: 'GET',
  jsonSchema: { response: { type: 'object', properties: { id: { type: 'string' } } } },
};

describe('admin.controller', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('createEndpointConfig', () => {
    it('responds 400 with real Zod issues for a malformed body, and never touches the database', async () => {
      const request = fakeRequest({ endpointName: 'missing-leading-slash', httpMethod: 'GET', jsonSchema: {} });
      const reply = fakeReply();

      await createEndpointConfig(request, reply);

      expect(reply.code).toHaveBeenCalledWith(400);
      const [sentBody] = reply.send.mock.calls[0] as [{ error: string; issues: unknown[] }];
      expect(sentBody.error).toBe('Validation Error');
      expect(sentBody.issues.length).toBeGreaterThan(0);
      expect(findOne).not.toHaveBeenCalled();
      expect(create).not.toHaveBeenCalled();
    });

    it('responds 400 when httpMethod is not one of the supported values', async () => {
      const request = fakeRequest({ ...VALID_INPUT, httpMethod: 'TRACE' });
      const reply = fakeReply();

      await createEndpointConfig(request, reply);

      expect(reply.code).toHaveBeenCalledWith(400);
    });

    it('responds 409 when a config for the same method+path already exists', async () => {
      findOne.mockResolvedValueOnce({ _id: 'existing' });
      const request = fakeRequest(VALID_INPUT);
      const reply = fakeReply();

      await createEndpointConfig(request, reply);

      expect(findOne).toHaveBeenCalledWith({ endpointName: '/api/users', httpMethod: 'GET' });
      expect(reply.code).toHaveBeenCalledWith(409);
      expect(reply.send).toHaveBeenCalledWith(
        expect.objectContaining({ error: 'Conflict', message: expect.stringContaining('/api/users') })
      );
      expect(create).not.toHaveBeenCalled();
      expect(registerInMemory).not.toHaveBeenCalled();
    });

    it('creates the config, registers it in memory, and responds 201 on success', async () => {
      findOne.mockResolvedValueOnce(null);
      const createdDoc = { _id: 'new-id', ...VALID_INPUT };
      create.mockResolvedValueOnce(createdDoc);
      const request = fakeRequest(VALID_INPUT);
      const reply = fakeReply();

      await createEndpointConfig(request, reply);

      expect(create).toHaveBeenCalledWith(VALID_INPUT);
      expect(registerInMemory).toHaveBeenCalledWith(createdDoc);
      expect(reply.code).toHaveBeenCalledWith(201);
      expect(reply.send).toHaveBeenCalledWith({ success: true, data: createdDoc });
    });

    it('uses the Zod-parsed data for the database calls, not the raw request body', async () => {
      // Extra/unexpected fields on the raw body must not leak through to
      // Mongo — only what CreateEndpointConfigSchema actually validated
      // should be persisted.
      findOne.mockResolvedValueOnce(null);
      create.mockResolvedValueOnce({ _id: 'new-id', ...VALID_INPUT });
      const request = fakeRequest({ ...VALID_INPUT, unexpectedField: 'should not persist' });

      await createEndpointConfig(request, fakeReply());

      expect(create).toHaveBeenCalledWith(VALID_INPUT);
      const createArg = create.mock.calls[0]?.[0] as Record<string, unknown>;
      expect(createArg).not.toHaveProperty('unexpectedField');
    });
  });

  describe('listEndpointConfigs', () => {
    it('responds with an empty list when the registry is empty', async () => {
      listRegisteredRoutes.mockReturnValue([]);
      const reply = fakeReply();

      await listEndpointConfigs(fakeRequest(undefined), reply);

      expect(reply.code).toHaveBeenCalledWith(200);
      expect(reply.send).toHaveBeenCalledWith({ success: true, count: 0, data: [] });
    });

    it('responds with every registered config and a matching count', async () => {
      const routes = [{ endpointName: '/api/users' }, { endpointName: '/api/orders' }];
      listRegisteredRoutes.mockReturnValue(routes);
      const reply = fakeReply();

      await listEndpointConfigs(fakeRequest(undefined), reply);

      expect(reply.send).toHaveBeenCalledWith({ success: true, count: 2, data: routes });
    });
  });
});
