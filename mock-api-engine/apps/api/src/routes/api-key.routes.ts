import type { FastifyInstance } from 'fastify';
import { createApiKeyHandler, getApiKeyUsageHandler } from '../controllers/api-key.controller';

export async function apiKeyRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.post('/api/v1/keys', createApiKeyHandler);
  fastify.get('/api/v1/keys/usage', getApiKeyUsageHandler);
}
