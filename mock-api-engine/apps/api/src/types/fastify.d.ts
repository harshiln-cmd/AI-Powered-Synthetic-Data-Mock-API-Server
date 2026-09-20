import type { IApiConfigDocument } from '../models/api-config.model';
import type { ApiKeyTier } from '@mock-api-engine/schema';

declare module 'fastify' {
  interface FastifyRequest {
    mockConfig?: IApiConfigDocument;
    apiKeyContext?: { tier: ApiKeyTier; keyHash: string };
  }
}
