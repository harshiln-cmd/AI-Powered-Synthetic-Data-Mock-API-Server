import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { FastifyReply, FastifyRequest } from 'fastify';
import type { IApiKeyDocument } from '../../src/models/api-key.model';

const { lookupApiKeyByRawKey, incrementAndCheckRateLimit, incrementMonthlyUsage } = vi.hoisted(() => ({
  lookupApiKeyByRawKey: vi.fn(),
  incrementAndCheckRateLimit: vi.fn(),
  incrementMonthlyUsage: vi.fn(),
}));

vi.mock('../../src/services/api-key.service', () => ({ lookupApiKeyByRawKey }));
vi.mock('../../src/services/rate-limit.service', () => ({ incrementAndCheckRateLimit, incrementMonthlyUsage }));

import { rateLimitGuard } from '../../src/middleware/rate-limit-guard';

function fakeRequest(headers: Record<string, string> = {}): FastifyRequest {
  return {
    headers,
    log: { error: vi.fn(), warn: vi.fn() },
    apiKeyContext: undefined,
  } as unknown as FastifyRequest;
}

function fakeReply(): FastifyReply & { code: ReturnType<typeof vi.fn>; send: ReturnType<typeof vi.fn>; header: ReturnType<typeof vi.fn> } {
  const reply = { code: vi.fn(), send: vi.fn(), header: vi.fn() };
  reply.code.mockReturnValue(reply);
  reply.header.mockReturnValue(reply);
  return reply as unknown as FastifyReply & {
    code: ReturnType<typeof vi.fn>;
    send: ReturnType<typeof vi.fn>;
    header: ReturnType<typeof vi.fn>;
  };
}

function fakeApiKeyDoc(overrides: Partial<IApiKeyDocument> = {}): IApiKeyDocument {
  return { keyHash: 'hash-abc', tier: 'free', isActive: true, ...overrides } as unknown as IApiKeyDocument;
}

describe('rateLimitGuard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    incrementMonthlyUsage.mockResolvedValue(1);
  });

  it('responds 401 when the x-api-key header is missing', async () => {
    const reply = fakeReply();

    await rateLimitGuard(fakeRequest({}), reply);

    expect(reply.code).toHaveBeenCalledWith(401);
    expect(reply.send).toHaveBeenCalledWith(expect.objectContaining({ error: 'Unauthorized' }));
    expect(lookupApiKeyByRawKey).not.toHaveBeenCalled();
  });

  it('responds 401 for a key that does not resolve to an active document', async () => {
    lookupApiKeyByRawKey.mockResolvedValueOnce(null);
    const reply = fakeReply();

    await rateLimitGuard(fakeRequest({ 'x-api-key': 'mk_live_invalid' }), reply);

    expect(reply.code).toHaveBeenCalledWith(401);
    expect(reply.send).toHaveBeenCalledWith(expect.objectContaining({ message: expect.stringContaining('Invalid or revoked') }));
    expect(incrementAndCheckRateLimit).not.toHaveBeenCalled();
  });

  it('fails CLOSED (503) when the API key lookup itself throws', async () => {
    lookupApiKeyByRawKey.mockRejectedValueOnce(new Error('Mongo unreachable'));
    const reply = fakeReply();

    await rateLimitGuard(fakeRequest({ 'x-api-key': 'mk_live_x' }), reply);

    expect(reply.code).toHaveBeenCalledWith(503);
    expect(incrementAndCheckRateLimit).not.toHaveBeenCalled();
  });

  it('fails CLOSED (503) when the Redis rate-limit check itself throws', async () => {
    lookupApiKeyByRawKey.mockResolvedValueOnce(fakeApiKeyDoc());
    incrementAndCheckRateLimit.mockRejectedValueOnce(new Error('Redis unreachable'));
    const reply = fakeReply();

    await rateLimitGuard(fakeRequest({ 'x-api-key': 'mk_live_x' }), reply);

    expect(reply.code).toHaveBeenCalledWith(503);
    expect(incrementMonthlyUsage).not.toHaveBeenCalled();
  });

  it('responds 429 with Retry-After when the limit is exceeded', async () => {
    lookupApiKeyByRawKey.mockResolvedValueOnce(fakeApiKeyDoc({ tier: 'free' }));
    incrementAndCheckRateLimit.mockResolvedValueOnce({ allowed: false, count: 51, limit: 50, retryAfterSeconds: 12 });
    const reply = fakeReply();

    await rateLimitGuard(fakeRequest({ 'x-api-key': 'mk_live_x' }), reply);

    expect(reply.header).toHaveBeenCalledWith('Retry-After', '12');
    expect(reply.code).toHaveBeenCalledWith(429);
    expect(reply.send).toHaveBeenCalledWith(expect.objectContaining({ error: 'Too Many Requests', retryAfterSeconds: 12 }));
    expect(incrementMonthlyUsage).not.toHaveBeenCalled();
  });

  it('uses the tier-appropriate limit when checking and reporting', async () => {
    lookupApiKeyByRawKey.mockResolvedValueOnce(fakeApiKeyDoc({ tier: 'pro' }));
    incrementAndCheckRateLimit.mockResolvedValueOnce({ allowed: true, count: 1, limit: 1000, retryAfterSeconds: 60 });
    const reply = fakeReply();

    await rateLimitGuard(fakeRequest({ 'x-api-key': 'mk_live_x' }), reply);

    expect(incrementAndCheckRateLimit).toHaveBeenCalledWith('hash-abc', 1000);
    expect(reply.header).toHaveBeenCalledWith('X-RateLimit-Limit', '1000');
  });

  it('allows the request through, sets rate-limit headers, and attaches apiKeyContext when under the limit', async () => {
    lookupApiKeyByRawKey.mockResolvedValueOnce(fakeApiKeyDoc({ tier: 'free', keyHash: 'hash-xyz' }));
    incrementAndCheckRateLimit.mockResolvedValueOnce({ allowed: true, count: 10, limit: 50, retryAfterSeconds: 60 });
    const request = fakeRequest({ 'x-api-key': 'mk_live_x' });
    const reply = fakeReply();

    await rateLimitGuard(request, reply);

    expect(reply.code).not.toHaveBeenCalled();
    expect(reply.send).not.toHaveBeenCalled();
    expect(reply.header).toHaveBeenCalledWith('X-RateLimit-Remaining', '40');
    expect(request.apiKeyContext).toEqual({ tier: 'free', keyHash: 'hash-xyz' });
    expect(incrementMonthlyUsage).toHaveBeenCalledWith('hash-xyz');
  });

  it('does not block an otherwise-allowed request when the monthly usage increment fails (fails open)', async () => {
    lookupApiKeyByRawKey.mockResolvedValueOnce(fakeApiKeyDoc());
    incrementAndCheckRateLimit.mockResolvedValueOnce({ allowed: true, count: 1, limit: 50, retryAfterSeconds: 60 });
    incrementMonthlyUsage.mockRejectedValueOnce(new Error('Redis blip'));
    const request = fakeRequest({ 'x-api-key': 'mk_live_x' });
    const reply = fakeReply();

    await rateLimitGuard(request, reply);

    expect(reply.code).not.toHaveBeenCalled();
    expect(request.apiKeyContext).toBeDefined();
  });
});
