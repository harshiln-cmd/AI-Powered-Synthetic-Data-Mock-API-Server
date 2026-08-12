import type { IApiConfigDocument } from '../models/api-config.model';

/**
 * Augments Fastify's request type so the mock-route preHandler can attach the
 * matched config, and the downstream handler can read it back with full
 * typing instead of an `any` cast.
 */
declare module 'fastify' {
  interface FastifyRequest {
    mockConfig?: IApiConfigDocument;
  }
}
