import { describe, it, expect, vi, beforeEach, afterEach, type Mock } from 'vitest';

// ---------------------------------------------------------------------------
// Mocks — everything ai.service.ts touches outside its own module boundary
// (the OpenAI SDK, its Zod-to-json-schema helper, and the shared schema
// package) is faked here so this suite never makes a network call and never
// needs a real OPENAI_API_KEY.
// ---------------------------------------------------------------------------

const mockParse: Mock = vi.fn();

vi.mock('openai', () => {
  // A plain arrow function can't be used as a constructor — `new OpenAI(...)`
  // in getClient() would throw "is not a constructor" the instant it's
  // invoked. A class (or a `function` that explicitly returns an object)
  // has a real [[Construct]], so `new` works correctly. mockParse is only
  // read when `chat` is actually initialized — i.e. at instantiation time,
  // well after this module's own top-level code (including `const
  // mockParse = vi.fn()` above) has already run — so this needs no
  // vi.hoisted() treatment, same as the rest of this file.
  class MockOpenAI {
    chat = {
      completions: {
        parse: mockParse,
      },
    };
  }
  return { default: MockOpenAI };
});

vi.mock('openai/helpers/zod', () => ({
  zodResponseFormat: vi.fn().mockReturnValue({
    type: 'json_schema',
    json_schema: { name: 'mock_payload' },
  }),
}));

vi.mock('@mock-api-engine/schema', () => ({
  jsonSchemaToZod: vi.fn().mockReturnValue({ __fakeZodSchema: true }),
}));

// Imported *after* the mocks above so the module under test resolves the
// mocked 'openai' constructor instead of the real SDK at import time — this
// matters because getClient() lazily constructs `new OpenAI(...)`.
import { generateSyntheticPayload, AiGenerationError } from '../../src/services/ai.service';
import type { JsonSchemaDefinition } from '@mock-api-engine/schema';

const SAMPLE_SCHEMA: JsonSchemaDefinition = {
  type: 'object',
  properties: {
    id: { type: 'string' },
    email: { type: 'string' },
  },
} as JsonSchemaDefinition;

const CONTEXT = { endpointName: '/users/:id', httpMethod: 'GET' };

describe('ai.service — generateSyntheticPayload', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.OPENAI_API_KEY = 'test-key';
  });

  afterEach(() => {
    delete process.env.OPENAI_API_KEY;
  });

  it('returns the parsed payload when OpenAI responds with a schema-conformant object', async () => {
    const fakePayload = { id: 'usr_9f3a', email: 'jane.doe@example.com' };

    mockParse.mockResolvedValueOnce({
      choices: [{ message: { parsed: fakePayload, refusal: null } }],
    });

    const result = await generateSyntheticPayload(SAMPLE_SCHEMA, CONTEXT);

    expect(result).toEqual(fakePayload);
    expect(mockParse).toHaveBeenCalledTimes(1);

    const [requestArg] = mockParse.mock.calls[0] as [Record<string, unknown>];
    expect(requestArg.model).toBeDefined();
    expect(Array.isArray(requestArg.messages)).toBe(true);
  });

  it('throws AiGenerationError when the model returns a refusal instead of data', async () => {
    mockParse.mockResolvedValueOnce({
      choices: [{ message: { parsed: null, refusal: 'cannot fulfill this request' } }],
    });

    await expect(generateSyntheticPayload(SAMPLE_SCHEMA, CONTEXT)).rejects.toBeInstanceOf(AiGenerationError);
  });

  it('throws AiGenerationError when the response has no parsable content', async () => {
    mockParse.mockResolvedValueOnce({
      choices: [{ message: { parsed: undefined, refusal: null } }],
    });

    await expect(generateSyntheticPayload(SAMPLE_SCHEMA, CONTEXT)).rejects.toThrow(
      /no parsable content/i
    );
  });

  it('wraps SDK failures (bad key / timeout / rate limit) in AiGenerationError, preserving the cause', async () => {
    const sdkError = new Error('Request timed out after 8000ms');
    mockParse.mockRejectedValueOnce(sdkError);

    try {
      await generateSyntheticPayload(SAMPLE_SCHEMA, CONTEXT);
      expect.fail('expected generateSyntheticPayload to reject');
    } catch (error) {
      expect(error).toBeInstanceOf(AiGenerationError);
      expect((error as AiGenerationError).cause).toBe(sdkError);
      expect((error as AiGenerationError).message).toContain('OpenAI request failed');
    }
  });

  it('never lets a raw SDK exception escape uncaught (e.g. missing/invalid API key)', async () => {
    mockParse.mockRejectedValueOnce(new Error('401 Incorrect API key provided'));

    await expect(generateSyntheticPayload(SAMPLE_SCHEMA, CONTEXT)).rejects.toBeInstanceOf(AiGenerationError);
  });
});
