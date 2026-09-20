import type { FastifyInstance } from 'fastify';
import { validateMockRequest } from '../middleware/validate-mock-request';
import { rateLimitGuard } from '../middleware/rate-limit-guard';
import { handleMockRequest } from '../controllers/mock.controller';

/**
 * preHandler order matters here: rateLimitGuard runs first, so a missing
 * key, invalid key, or exceeded rate limit is rejected before
 * validateMockRequest (schema validation) or handleMockRequest (the AI
 * generation call) ever run — no OpenAI tokens are spent on a request this
 * blocks. Verified via Fastify's inject(): a reply sent from the first
 * preHandler in the array genuinely short-circuits the rest of the chain.
 */
export async function mockRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.all('/api/v1/mock/*', { preHandler: [rateLimitGuard, validateMockRequest] }, handleMockRequest);
}
