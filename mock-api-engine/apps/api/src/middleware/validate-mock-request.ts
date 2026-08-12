import type { FastifyRequest, FastifyReply } from 'fastify';
import { jsonSchemaToZod } from '@mock-api-engine/schema';
import { lookupRoute } from '../services/route-registry.service';

function extractEndpointName(request: FastifyRequest): string {
  const params = request.params as Record<string, string>;
  const wildcard = params['*'] ?? '';
  return `/${wildcard}`;
}

/**
 * Fastify preHandler = the "middleware" that intercepts every request before
 * the route's main handler runs. Two responsibilities:
 *   1. Resolve which stored config this request maps to (404 if none).
 *   2. Zod-validate body/query against that config's jsonSchema (400 on failure).
 *
 * If either step fails, we call reply.send() and return — Fastify detects the
 * reply has already been sent and skips the main handler entirely, so
 * controllers/mock.controller.ts only ever runs for requests that passed
 * both checks.
 */
export async function validateMockRequest(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const endpointName = extractEndpointName(request);
  const httpMethod = request.method.toUpperCase();

  const config = lookupRoute(httpMethod, endpointName);
  if (!config) {
    reply.code(404).send({
      error: 'Not Found',
      message: `No mock endpoint registered for ${httpMethod} ${endpointName}`,
    });
    return;
  }

  if (!config.isActive) {
    reply.code(404).send({
      error: 'Not Found',
      message: `Mock endpoint ${httpMethod} ${endpointName} exists but is currently inactive`,
    });
    return;
  }

  const { body: bodySchemaDef, query: querySchemaDef } = config.jsonSchema ?? {};

  if (bodySchemaDef) {
    const result = jsonSchemaToZod(bodySchemaDef).safeParse(request.body);
    if (!result.success) {
      reply.code(400).send({
        error: 'Validation Error',
        location: 'body',
        issues: result.error.issues,
      });
      return;
    }
  }

  if (querySchemaDef) {
    const result = jsonSchemaToZod(querySchemaDef).safeParse(request.query);
    if (!result.success) {
      reply.code(400).send({
        error: 'Validation Error',
        location: 'query',
        issues: result.error.issues,
      });
      return;
    }
  }

  // Hand the matched config to the main handler so it doesn't have to
  // re-run the lookup.
  request.mockConfig = config;
}
