import type { FastifyRequest, FastifyReply } from 'fastify';
import { CreateApiKeySchema, TIER_MONTHLY_QUOTA } from '@mock-api-engine/schema';
import { createApiKey, lookupApiKeyByRawKey } from '../services/api-key.service';
import { getMonthlyUsage, startOfNextMonthIso } from '../services/rate-limit.service';

/**
 * POST /api/v1/keys
 *
 * No user/auth system exists anywhere in this project, so this is
 * necessarily an open, unauthenticated "give me a key" endpoint — a
 * reasonable MVP simplification, but worth being explicit about: a real
 * deployment would tie key creation to an authenticated account and likely
 * rate-limit or gate this endpoint itself, since as written anyone can mint
 * unlimited free-tier keys.
 */
export async function createApiKeyHandler(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const parseResult = CreateApiKeySchema.safeParse(request.body ?? {});
  if (!parseResult.success) {
    reply.code(400).send({ error: 'Validation Error', issues: parseResult.error.issues });
    return;
  }

  const { tier } = parseResult.data;
  const { rawKey, document } = await createApiKey(tier);

  // The only response, ever, that carries the plaintext key — it is not
  // stored in reversible form and cannot be retrieved again after this.
  reply.code(201).send({
    success: true,
    data: {
      apiKey: rawKey,
      keyPrefix: document.keyPrefix,
      tier: document.tier,
      createdAt: document.createdAt,
    },
  });
}

/**
 * GET /api/v1/keys/usage
 *
 * Identifies which key to report on via the same x-api-key header the rate
 * limiter reads — this project has no session/user concept to identify
 * "the current user" any other way.
 */
export async function getApiKeyUsageHandler(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const apiKeyHeader = request.headers['x-api-key'];
  if (!apiKeyHeader || typeof apiKeyHeader !== 'string') {
    reply.code(401).send({ error: 'Unauthorized', message: 'Missing required x-api-key header.' });
    return;
  }

  const apiKeyDoc = await lookupApiKeyByRawKey(apiKeyHeader);
  if (!apiKeyDoc) {
    reply.code(401).send({ error: 'Unauthorized', message: 'Invalid or revoked API key.' });
    return;
  }

  const used = await getMonthlyUsage(apiKeyDoc.keyHash);
  const limit = TIER_MONTHLY_QUOTA[apiKeyDoc.tier];

  reply.code(200).send({
    success: true,
    data: {
      tier: apiKeyDoc.tier,
      used,
      limit,
      remaining: Math.max(0, limit - used),
      periodResetsAt: startOfNextMonthIso(),
    },
  });
}
