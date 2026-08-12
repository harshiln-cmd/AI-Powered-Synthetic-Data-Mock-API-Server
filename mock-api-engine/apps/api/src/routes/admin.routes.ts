import type { FastifyInstance } from 'fastify';
import { createEndpointConfig, listEndpointConfigs } from '../controllers/admin.controller';

export async function adminRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.post('/admin/endpoints', createEndpointConfig);
  fastify.get('/admin/endpoints', listEndpointConfigs);
}
