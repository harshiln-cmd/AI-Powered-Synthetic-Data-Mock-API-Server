import OpenAI from 'openai';
import { zodResponseFormat } from 'openai/helpers/zod';
import { jsonSchemaToZod, type JsonSchemaDefinition } from '@mock-api-engine/schema';

// "gpt-5.6-terra" — OpenAI's balanced mid-tier model (github.com/openai model
// guidance: "gpt-5.6-terra for a balance of intelligence and cost"). This is
// simple structured-data generation, not multi-step reasoning, so the
// flagship "sol" tier would be paying for reasoning depth this task doesn't
// use. Override via OPENAI_MODEL if you'd rather trade cost for quality.
const MODEL = process.env.OPENAI_MODEL ?? 'gpt-5.6-terra';

// rules.md "Token Budget Guard": a strict, controllable ceiling on generation
// cost per request. `max_tokens` is deprecated by OpenAI in favor of
// `max_completion_tokens` — confirmed against the installed SDK's own types.
const MAX_COMPLETION_TOKENS = Number(process.env.AI_MAX_TOKENS ?? 1000);
const REQUEST_TIMEOUT_MS = Number(process.env.AI_TIMEOUT_MS ?? 8000);

let cachedClient: OpenAI | null = null;

/**
 * Constructed lazily, on first actual use, rather than at module scope.
 * Verified this the hard way: constructing `new OpenAI(...)` at module scope
 * throws immediately if OPENAI_API_KEY is unset — and since this module gets
 * imported transitively at server boot (server.ts -> routes -> controller ->
 * here), that crashed the *entire process* before it could serve a single
 * request, let alone fall back to Faker. Lazy construction means that same
 * error only surfaces inside generateSyntheticPayload()'s try/catch below,
 * where it's just another caught failure routed to the fallback — exactly
 * like a rate limit or timeout would be.
 */
function getClient(): OpenAI {
  if (!cachedClient) {
    cachedClient = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  }
  return cachedClient;
}

export class AiGenerationError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message);
    this.name = 'AiGenerationError';
    this.cause = options?.cause;
  }
}

export interface GenerationContext {
  endpointName: string;
  httpMethod: string;
}

/**
 * rules.md "UNCONSTRAINED AI PROMPTING" is an explicit anti-pattern — the
 * model is never allowed to return free-form text here. jsonSchemaToZod()
 * (with openAiStrictMode, since OpenAI's strict JSON Schema mode has no
 * "optional key" concept — see json-schema-to-zod.ts) builds the exact
 * shape, zodResponseFormat() turns that into the API's json_schema format,
 * and .parse() rejects/retries anything that doesn't conform — the model
 * physically cannot return a payload that breaks the API contract.
 */
export async function generateSyntheticPayload(
  responseSchema: JsonSchemaDefinition,
  context: GenerationContext
): Promise<unknown> {
  const zodSchema = jsonSchemaToZod(responseSchema, { openAiStrictMode: true });

  try {
    const client = getClient();
    const completion = await client.chat.completions.parse(
      {
        model: MODEL,
        max_completion_tokens: MAX_COMPLETION_TOKENS,
        messages: [
          {
            role: 'system',
            content:
              'You generate realistic example JSON data for mocking REST APIs during development and testing. ' +
              'Produce plausible, varied, production-like values (real-looking names, emails, dates, ids) — ' +
              'never literal placeholders like "string" or "test123". Follow the given schema exactly.',
          },
          {
            role: 'user',
            content: `Generate one realistic example JSON payload for a ${context.httpMethod} ${context.endpointName} mock API response.`,
          },
        ],
        response_format: zodResponseFormat(zodSchema, 'mock_payload'),
      },
      { timeout: REQUEST_TIMEOUT_MS }
    );

    const message = completion.choices[0]?.message;

    if (message?.refusal) {
      throw new AiGenerationError(`Model refused to generate a payload: ${message.refusal}`);
    }
    if (!message || message.parsed === null || message.parsed === undefined) {
      throw new AiGenerationError('OpenAI returned no parsable content');
    }

    return message.parsed;
  } catch (error) {
    if (error instanceof AiGenerationError) throw error;
    // Covers RateLimitError, APIConnectionTimeoutError, APIConnectionError,
    // InternalServerError, a missing-credentials OpenAIError, etc. — every
    // one of these is exactly what rules.md's fallback strategy exists for,
    // so we normalize them into a single error type and let the caller
    // (mock.controller.ts) fall back rather than propagate a raw SDK
    // exception (or, previously, crash at import time).
    throw new AiGenerationError(`OpenAI request failed: ${(error as Error).message}`, { cause: error });
  }
}
