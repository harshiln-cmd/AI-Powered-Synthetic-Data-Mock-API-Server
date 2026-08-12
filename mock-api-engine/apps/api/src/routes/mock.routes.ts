import type { FastifyInstance } from 'fastify';
import { validateMockRequest } from '../middleware/validate-mock-request';
import { handleMockRequest } from '../controllers/mock.controller';

/**
 * One route (fastify.all + wildcard) covers every method and every path
 * under /api/v1/mock/*. Which config a given request actually maps to is
 * resolved at request time in validateMockRequest, not at route-registration
 * time — see route-registry.service.ts for the full rationale.
 */
export async function mockRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.all('/api/v1/mock/*', { preHandler: validateMockRequest }, handleMockRequest);
}
