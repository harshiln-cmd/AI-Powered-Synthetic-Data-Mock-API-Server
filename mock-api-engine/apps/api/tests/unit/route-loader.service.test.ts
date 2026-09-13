import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { IApiConfigDocument } from '../../src/models/api-config.model';

// ---------------------------------------------------------------------------
// Mocks ApiConfigModel (the database dependency) and route-registry.service
// (for isolation from that module's own state — it has its own dedicated
// test file). Note: this file has no Fastify dependency to mock at all —
// loadRoutesFromDatabase() only touches ApiConfigModel and
// route-registry.service. Fastify only enters the picture later, in
// server.ts, which calls this function's *result*; it's never imported
// here.
// ---------------------------------------------------------------------------

const { mockFind, mockExec, registerInMemory, getRegistrySize } = vi.hoisted(() => ({
  mockFind: vi.fn(),
  mockExec: vi.fn(),
  registerInMemory: vi.fn(),
  getRegistrySize: vi.fn(),
}));

vi.mock('../../src/models/api-config.model', () => ({
  ApiConfigModel: { find: mockFind },
}));

vi.mock('../../src/services/route-registry.service', () => ({
  registerInMemory,
  getRegistrySize,
}));

import { loadRoutesFromDatabase } from '../../src/services/route-loader.service';

function fakeConfig(endpointName: string): IApiConfigDocument {
  return { endpointName, httpMethod: 'GET', isActive: true } as unknown as IApiConfigDocument;
}

describe('route-loader.service — loadRoutesFromDatabase', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Mongoose query chaining: Model.find(...).exec() — .find() itself
    // isn't async, only .exec() (or awaiting the query directly) is.
    mockFind.mockReturnValue({ exec: mockExec });
  });

  it('queries only active configs', async () => {
    mockExec.mockResolvedValueOnce([]);
    getRegistrySize.mockReturnValue(0);

    await loadRoutesFromDatabase();

    expect(mockFind).toHaveBeenCalledWith({ isActive: true });
  });

  it('registers every config returned by the query, in order', async () => {
    const users = fakeConfig('/api/users');
    const orders = fakeConfig('/api/orders');
    mockExec.mockResolvedValueOnce([users, orders]);
    getRegistrySize.mockReturnValue(2);

    await loadRoutesFromDatabase();

    // Checking just the first argument of each call, not the full call
    // signature: the source passes registerInMemory directly to
    // configs.forEach(), so it also receives forEach's own (index, array)
    // arguments on every call. The real function only declares one
    // parameter and ignores the rest, which is fine — but asserting the
    // exact 3-argument call shape here would make this test brittle to
    // that incidental detail rather than the thing that actually matters:
    // which config each call received.
    expect(registerInMemory).toHaveBeenCalledTimes(2);
    expect(registerInMemory.mock.calls[0]?.[0]).toBe(users);
    expect(registerInMemory.mock.calls[1]?.[0]).toBe(orders);
  });

  it('returns whatever the registry reports as its size after loading', async () => {
    mockExec.mockResolvedValueOnce([fakeConfig('/api/users')]);
    getRegistrySize.mockReturnValue(1);

    const result = await loadRoutesFromDatabase();

    expect(result).toBe(1);
  });

  it('registers nothing and returns 0 when there are no active configs', async () => {
    mockExec.mockResolvedValueOnce([]);
    getRegistrySize.mockReturnValue(0);

    const result = await loadRoutesFromDatabase();

    expect(registerInMemory).not.toHaveBeenCalled();
    expect(result).toBe(0);
  });

  it('propagates a database query failure rather than swallowing it', async () => {
    mockExec.mockRejectedValueOnce(new Error('connection lost'));

    await expect(loadRoutesFromDatabase()).rejects.toThrow('connection lost');
    expect(registerInMemory).not.toHaveBeenCalled();
  });
});
