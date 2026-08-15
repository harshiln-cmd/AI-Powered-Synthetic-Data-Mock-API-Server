import type { FastifyRequest, FastifyReply } from 'fastify';
import type { JsonSchemaDefinition } from '@mock-api-engine/schema';
import type { IApiConfigDocument } from '../models/api-config.model';
import { buildCacheKey, getCachedPayload, setCachedPayload, FALLBACK_TTL_SECONDS } from '../services/cache.service';
import { generateSyntheticPayload } from '../services/ai.service';
import { generateFallbackPayload } from '../services/fallback.service';

/**
 * Which schema describes the payload we should generate. `response` is the
 * Phase 2 field for this; `body` is a best-effort fallback for configs
 * created before it existed (Phase 1 only stored body/query), and a bare
 * object schema is the last resort so generation always has *something* to
 * work from.
 */
function resolveResponseSchema(config: IApiConfigDocument): JsonSchemaDefinition {
  return config.jsonSchema?.response ?? config.jsonSchema?.body ?? { type: 'object', properties: {} };
}

/** What actually gets stored in Redis — the payload plus whether it came from the Faker fallback, so a later cache HIT can still report that accurately. */
interface CachedEntry {
  payload: unknown;
  isFallback: boolean;
}

/**
 * By the time this runs, validateMockRequest has already confirmed the route
 * exists and the request body/query passed Zod validation, and attached the
 * matched config to request.mockConfig.
 *
 * Flow: check Redis (4a) -> on miss, call the AI service (4b), falling back
 * to Faker-generated data on any AI failure per rules.md -> cache whatever
 * was generated (4c) -> respond (4d).
 */
export async function handleMockRequest(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const config = request.mockConfig;

  if (!config) {
    // Defensive only: validateMockRequest short-circuits before this handler
    // runs whenever no config is found, so this branch should be unreachable.
    reply.code(500).send({ error: 'Internal Server Error', message: 'mockConfig missing after validation' });
    return;
  }

  try {
    const cacheKey = buildCacheKey(config.httpMethod, config.endpointName, request.body, request.query);

    // --- 4a: cache check ---
    const cached = await getCachedPayload<CachedEntry>(cacheKey);
    if (cached !== null) {
      // A cache HIT on data that was originally a fallback is still
      // fallback data — the flag needs to survive the cache, not just the
      // one response that generated it.
      if (cached.isFallback) {
        reply.header('X-Mock-Fallback', 'True');
      }
      reply.header('X-Mock-Cache', 'HIT').code(200).send(cached.payload);
      return;
    }

    const responseSchema = resolveResponseSchema(config);

    // --- 4b: cache miss -> generate, with fallback on any AI failure ---
    let payload: unknown;
    let usedFallback = false;
    try {
      payload = await generateSyntheticPayload(responseSchema, {
        endpointName: config.endpointName,
        httpMethod: config.httpMethod,
      });
    } catch (error) {
      // rules.md "Fallback Strategy": MUST fall back to a local static dummy
      // generator on AI timeout/rate-limit/failure, flagged via
      // X-Mock-Fallback. Treated broadly here — any AI failure gets the same
      // graceful degradation, not just the two named cases — since a flaky
      // AI vendor should never be able to take the whole mock server down.
      request.log.warn({ err: error }, '[mock] AI generation failed, using Faker fallback');
      payload = generateFallbackPayload(responseSchema);
      usedFallback = true;
    }

    // --- 4c: cache what we generated ---
    // Fallback payloads get a much shorter TTL than real AI output (see
    // cache.service.ts) so a transient outage doesn't "stick" low-quality
    // data in the cache for the full hour — the next request after the
    // short window retries the AI service instead.
    const entry: CachedEntry = { payload, isFallback: usedFallback };
    await setCachedPayload(cacheKey, entry, usedFallback ? FALLBACK_TTL_SECONDS : undefined);

    // --- 4d: respond ---
    if (usedFallback) {
      reply.header('X-Mock-Fallback', 'True');
    }
    reply.header('X-Mock-Cache', 'MISS').code(200).send(payload);
  } catch (error) {
    // Genuinely unexpected failure (not a known AI failure mode — those are
    // handled above via the Faker fallback). Faker/cache-key logic is pure
    // and synchronous so this should be very rare in practice.
    request.log.error({ err: error }, '[mock] unexpected error handling mock request');
    reply.code(500).send({
      error: 'Internal Server Error',
      message: 'Unexpected failure while generating the mock response.',
    });
  }
}
