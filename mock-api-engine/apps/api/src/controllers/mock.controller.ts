import type { FastifyRequest, FastifyReply } from 'fastify';

/**
 * By the time this runs, validateMockRequest has already confirmed the route
 * exists and the request body/query passed Zod validation, and attached the
 * matched config to request.mockConfig.
 *
 * Phase 1 scope: no AI, no Redis — just prove the pipeline end-to-end with a
 * static payload. Phase 2 swaps this handler's body for the LLM call +
 * cache-first lookup described in architecture.md, without touching the
 * routing or validation layers above it.
 */
export async function handleMockRequest(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const config = request.mockConfig;

  if (!config) {
    // Defensive only: validateMockRequest short-circuits before this handler
    // runs whenever no config is found, so this branch should be unreachable.
    reply.code(500).send({ error: 'Internal Server Error', message: 'mockConfig missing after validation' });
    return;
  }

  reply.code(200).send({
    success: true,
    message: 'Request validated against the registered schema.',
    data: {
      endpoint: config.endpointName,
      method: config.httpMethod,
    },
    _meta: {
      note: 'Static Phase 1 stub response — AI-generated payloads arrive in Phase 2.',
    },
  });
}
