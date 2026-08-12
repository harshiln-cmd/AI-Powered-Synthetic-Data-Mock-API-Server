import type { FastifyRequest, FastifyReply } from 'fastify';
import { CreateEndpointConfigSchema } from '@mock-api-engine/schema';
import { ApiConfigModel } from '../models/api-config.model';
import { registerInMemory, listRegisteredRoutes } from '../services/route-registry.service';

/**
 * POST /admin/endpoints
 *
 * This is the "specific admin route" half of dynamic registration mentioned
 * in the brief: saving a new config here calls registerInMemory() directly,
 * so the mock endpoint is live on the very next request — no restart, and
 * no need to touch Fastify's router (see route-registry.service.ts).
 */
export async function createEndpointConfig(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const parseResult = CreateEndpointConfigSchema.safeParse(request.body);
  if (!parseResult.success) {
    reply.code(400).send({ error: 'Validation Error', issues: parseResult.error.issues });
    return;
  }

  const { endpointName, httpMethod, jsonSchema } = parseResult.data;

  const existing = await ApiConfigModel.findOne({ endpointName, httpMethod });
  if (existing) {
    reply.code(409).send({
      error: 'Conflict',
      message: `A config for ${httpMethod} ${endpointName} already exists.`,
    });
    return;
  }

  const created = await ApiConfigModel.create({ endpointName, httpMethod, jsonSchema });
  registerInMemory(created);

  reply.code(201).send({ success: true, data: created });
}

/** GET /admin/endpoints — lists whatever is currently live in the registry, primarily useful for verifying Step 3 actually works end to end. */
export async function listEndpointConfigs(_request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const routes = listRegisteredRoutes();
  reply.code(200).send({ success: true, count: routes.length, data: routes });
}
