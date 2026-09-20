import type { FastifyRequest, FastifyReply } from 'fastify';
import { TIER_RATE_LIMIT_PER_MINUTE } from '@mock-api-engine/schema';
import { lookupApiKeyByRawKey } from '../services/api-key.service';
import { incrementAndCheckRateLimit, incrementMonthlyUsage } from '../services/rate-limit.service';

/**
 * Registered as the FIRST preHandler on the mock wildcard route (before
 * validateMockRequest), so an unauthorized or rate-limited request never
 * reaches schema validation, let alone the AI generation call in
 * mock.controller.ts — no OpenAI tokens are spent on a request this
 * function blocks.
 *
 * Fail-CLOSED on any infrastructure error (Redis unreachable, Mongo lookup
 * failing) — deliberately different from cache.service.ts's fail-open
 * policy. Caching is a pure latency optimization with no downside if it's
 * unavailable; rate limiting exists specifically for cost/abuse control, so
 * letting requests through unmetered when we can't verify the limit would
 * risk exactly the runaway AI-token cost this feature exists to prevent.
 */
export async function rateLimitGuard(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const apiKeyHeader = request.headers['x-api-key'];

  if (!apiKeyHeader || typeof apiKeyHeader !== 'string') {
    reply.code(401).send({ error: 'Unauthorized', message: 'Missing required x-api-key header.' });
    return;
  }

  let apiKeyDoc;
  try {
    apiKeyDoc = await lookupApiKeyByRawKey(apiKeyHeader);
  } catch (error) {
    request.log.error({ err: error }, '[rate-limit] failed to look up API key');
    reply
      .code(503)
      .send({ error: 'Service Unavailable', message: 'Could not verify the API key right now. Try again shortly.' });
    return;
  }

  if (!apiKeyDoc) {
    reply.code(401).send({ error: 'Unauthorized', message: 'Invalid or revoked API key.' });
    return;
  }

  const limit = TIER_RATE_LIMIT_PER_MINUTE[apiKeyDoc.tier];

  let rateLimitResult;
  try {
    rateLimitResult = await incrementAndCheckRateLimit(apiKeyDoc.keyHash, limit);
  } catch (error) {
    request.log.error({ err: error }, '[rate-limit] Redis unavailable, failing closed');
    reply
      .code(503)
      .send({ error: 'Service Unavailable', message: 'Rate limiting is temporarily unavailable. Try again shortly.' });
    return;
  }

  reply.header('X-RateLimit-Limit', String(limit));
  reply.header('X-RateLimit-Remaining', String(Math.max(0, limit - rateLimitResult.count)));

  if (!rateLimitResult.allowed) {
    reply.header('Retry-After', String(rateLimitResult.retryAfterSeconds));
    reply.code(429).send({
      error: 'Too Many Requests',
      message: `Rate limit exceeded: ${limit} requests/minute for the ${apiKeyDoc.tier} tier.`,
      retryAfterSeconds: rateLimitResult.retryAfterSeconds,
    });
    return;
  }

  // Deliberately fail OPEN here, unlike the rate-limit check above: this
  // only feeds the dashboard's informational usage stats, not the
  // allow/deny decision, which has already happened successfully by this
  // point. Losing a usage-counter increment shouldn't block an otherwise
  // legitimate request.
  try {
    await incrementMonthlyUsage(apiKeyDoc.keyHash);
  } catch (error) {
    request.log.warn({ err: error }, '[rate-limit] failed to increment monthly usage counter');
  }

  request.apiKeyContext = { tier: apiKeyDoc.tier, keyHash: apiKeyDoc.keyHash };
}
