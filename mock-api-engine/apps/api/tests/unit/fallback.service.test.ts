import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { JsonSchemaDefinition } from '@mock-api-engine/schema';

// ---------------------------------------------------------------------------
// Mock @faker-js/faker entirely. This suite is testing fallback.service.ts's
// *routing logic* — which faker call each schema type/format/field-name
// maps to — not faker's own randomness, so every generator is a controllable
// spy rather than the real (non-deterministic) implementation.
// ---------------------------------------------------------------------------

const { mockFaker } = vi.hoisted(() => {
  return {
    mockFaker: {
      number: { float: vi.fn(), int: vi.fn() },
      datatype: { boolean: vi.fn() },
      helpers: { arrayElement: vi.fn() },
      string: { uuid: vi.fn() },
      internet: { email: vi.fn(), url: vi.fn() },
      date: { recent: vi.fn() },
      lorem: { words: vi.fn() },
      person: { fullName: vi.fn() },
      phone: { number: vi.fn() },
      location: { streetAddress: vi.fn() },
    },
  };
});

vi.mock('@faker-js/faker', () => ({ faker: mockFaker }));

import { generateFallbackPayload } from '../../src/services/fallback.service';

/** Casts a plain object literal to the shared schema type without needing
 * its exact shape available at test time. */
function schema(definition: Record<string, unknown>): JsonSchemaDefinition {
  return definition as unknown as JsonSchemaDefinition;
}

describe('fallback.service — generateFallbackPayload', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('primitive types', () => {
    it('type "boolean" delegates to faker.datatype.boolean', () => {
      mockFaker.datatype.boolean.mockReturnValueOnce(true);

      expect(generateFallbackPayload(schema({ type: 'boolean' }))).toBe(true);
    });

    it('type "number" uses faker.number.float with schema bounds and 2 decimal places', () => {
      mockFaker.number.float.mockReturnValueOnce(42.5);

      const result = generateFallbackPayload(schema({ type: 'number', minimum: 10, maximum: 50 }));

      expect(result).toBe(42.5);
      expect(mockFaker.number.float).toHaveBeenCalledWith({ min: 10, max: 50, fractionDigits: 2 });
    });

    it('type "number" defaults to a 0–1000 range when no bounds are given', () => {
      mockFaker.number.float.mockReturnValueOnce(1);

      generateFallbackPayload(schema({ type: 'number' }));

      expect(mockFaker.number.float).toHaveBeenCalledWith({ min: 0, max: 1000, fractionDigits: 2 });
    });

    it('type "integer" uses faker.number.int with schema bounds', () => {
      mockFaker.number.int.mockReturnValueOnce(7);

      const result = generateFallbackPayload(schema({ type: 'integer', minimum: 1, maximum: 10 }));

      expect(result).toBe(7);
      expect(mockFaker.number.int).toHaveBeenCalledWith({ min: 1, max: 10 });
    });

    it('type "integer" defaults to a 0–1000 range when no bounds are given', () => {
      mockFaker.number.int.mockReturnValueOnce(500);

      generateFallbackPayload(schema({ type: 'integer' }));

      expect(mockFaker.number.int).toHaveBeenCalledWith({ min: 0, max: 1000 });
    });

    it('an unrecognized/missing type falls through to null', () => {
      expect(generateFallbackPayload(schema({}))).toBeNull();
      expect(generateFallbackPayload(schema({ type: 'null' }))).toBeNull();
    });
  });

  describe('string generation', () => {
    it('an enum picks one of the listed values via faker.helpers.arrayElement', () => {
      mockFaker.helpers.arrayElement.mockReturnValueOnce('ACTIVE');

      const result = generateFallbackPayload(schema({ type: 'string', enum: ['ACTIVE', 'INACTIVE'] }));

      expect(result).toBe('ACTIVE');
      expect(mockFaker.helpers.arrayElement).toHaveBeenCalledWith(['ACTIVE', 'INACTIVE']);
    });

    it('format "email" delegates to faker.internet.email', () => {
      mockFaker.internet.email.mockReturnValueOnce('person@example.com');

      expect(generateFallbackPayload(schema({ type: 'string', format: 'email' }))).toBe('person@example.com');
    });

    it('format "uuid" delegates to faker.string.uuid', () => {
      mockFaker.string.uuid.mockReturnValueOnce('11111111-1111-1111-1111-111111111111');

      expect(generateFallbackPayload(schema({ type: 'string', format: 'uuid' }))).toBe(
        '11111111-1111-1111-1111-111111111111'
      );
    });

    it('format "uri" delegates to faker.internet.url', () => {
      mockFaker.internet.url.mockReturnValueOnce('https://example.com');

      expect(generateFallbackPayload(schema({ type: 'string', format: 'uri' }))).toBe('https://example.com');
    });

    it('format "date-time" delegates to faker.date.recent().toISOString()', () => {
      mockFaker.date.recent.mockReturnValueOnce(new Date('2024-01-01T00:00:00.000Z'));

      const result = generateFallbackPayload(schema({ type: 'string', format: 'date-time' }));

      expect(result).toBe('2024-01-01T00:00:00.000Z');
    });

    it('an unrecognized/absent format falls back to faker.lorem.words', () => {
      mockFaker.lorem.words.mockReturnValueOnce('lorem ipsum');

      const result = generateFallbackPayload(schema({ type: 'string' }));

      expect(result).toBe('lorem ipsum');
      expect(mockFaker.lorem.words).toHaveBeenCalledWith({ min: 2, max: 4 });
    });
  });

  describe('arrays', () => {
    it('generates between 1 and 3 items, each produced by recursing into `items`', () => {
      mockFaker.number.int
        .mockReturnValueOnce(2) // array length
        .mockReturnValueOnce(3) // first item value
        .mockReturnValueOnce(4); // second item value

      const result = generateFallbackPayload(
        schema({ type: 'array', items: { type: 'integer', minimum: 1, maximum: 5 } })
      );

      expect(result).toEqual([3, 4]);
      expect(mockFaker.number.int).toHaveBeenNthCalledWith(1, { min: 1, max: 3 });
      expect(mockFaker.number.int).toHaveBeenNthCalledWith(2, { min: 1, max: 5 });
      expect(mockFaker.number.int).toHaveBeenNthCalledWith(3, { min: 1, max: 5 });
    });

    it('fills with null when the schema has no `items` definition', () => {
      mockFaker.number.int.mockReturnValueOnce(3); // array length only

      const result = generateFallbackPayload(schema({ type: 'array' }));

      expect(result).toEqual([null, null, null]);
    });
  });

  describe('objects', () => {
    it('generates one value per schema property', () => {
      mockFaker.string.uuid.mockReturnValueOnce('22222222-2222-2222-2222-222222222222');
      mockFaker.datatype.boolean.mockReturnValueOnce(true);

      const result = generateFallbackPayload(
        schema({
          type: 'object',
          properties: {
            id: { type: 'string' },
            isActive: { type: 'boolean' },
          },
        })
      );

      expect(result).toEqual({
        id: '22222222-2222-2222-2222-222222222222',
        isActive: true,
      });
    });

    it('returns an empty object when the schema declares no properties', () => {
      expect(generateFallbackPayload(schema({ type: 'object' }))).toEqual({});
    });
  });

  describe('field-name heuristics (untyped/unformatted string properties)', () => {
    it('infers a plausible generator from the property key when no format/enum is set', () => {
      mockFaker.internet.email.mockReturnValueOnce('ada@example.com');
      mockFaker.string.uuid.mockReturnValue('33333333-3333-3333-3333-333333333333');
      mockFaker.person.fullName.mockReturnValueOnce('Ada Lovelace');
      mockFaker.phone.number.mockReturnValueOnce('+1-555-0100');
      mockFaker.internet.url.mockReturnValueOnce('https://example.com');
      mockFaker.location.streetAddress.mockReturnValueOnce('123 Main St');
      mockFaker.lorem.words.mockReturnValueOnce('generic filler text');

      const result = generateFallbackPayload(
        schema({
          type: 'object',
          properties: {
            email: { type: 'string' },
            userId: { type: 'string' },
            fullName: { type: 'string' },
            phoneNumber: { type: 'string' },
            websiteUrl: { type: 'string' },
            billingAddress: { type: 'string' },
            description: { type: 'string' },
          },
        })
      ) as Record<string, unknown>;

      expect(result.email).toBe('ada@example.com');
      expect(result.userId).toBe('33333333-3333-3333-3333-333333333333');
      expect(result.fullName).toBe('Ada Lovelace');
      expect(result.phoneNumber).toBe('+1-555-0100');
      expect(result.websiteUrl).toBe('https://example.com');
      expect(result.billingAddress).toBe('123 Main St');
      // No heuristic matches "description" — falls through to lorem.words.
      expect(result.description).toBe('generic filler text');
    });

    it('an explicit format always wins over the field-name heuristic', () => {
      // Key says "email", but the schema pins the format to uuid — the
      // heuristic must not override an author's explicit choice.
      mockFaker.string.uuid.mockReturnValueOnce('44444444-4444-4444-4444-444444444444');

      const result = generateFallbackPayload(
        schema({
          type: 'object',
          properties: {
            email: { type: 'string', format: 'uuid' },
          },
        })
      ) as Record<string, unknown>;

      expect(result.email).toBe('44444444-4444-4444-4444-444444444444');
      expect(mockFaker.internet.email).not.toHaveBeenCalled();
    });

    it('an explicit enum also wins over the field-name heuristic', () => {
      mockFaker.helpers.arrayElement.mockReturnValueOnce('gmail.com');

      const result = generateFallbackPayload(
        schema({
          type: 'object',
          properties: {
            email: { type: 'string', enum: ['gmail.com', 'yahoo.com'] },
          },
        })
      ) as Record<string, unknown>;

      expect(result.email).toBe('gmail.com');
      expect(mockFaker.internet.email).not.toHaveBeenCalled();
    });

    it('non-string properties are unaffected by the name heuristics', () => {
      mockFaker.number.int.mockReturnValueOnce(99);

      const result = generateFallbackPayload(
        schema({
          type: 'object',
          properties: {
            // Named like an id, but typed as an integer — heuristics only
            // apply to `type: 'string'` fields.
            id: { type: 'integer', minimum: 1, maximum: 100 },
          },
        })
      ) as Record<string, unknown>;

      expect(result.id).toBe(99);
      expect(mockFaker.string.uuid).not.toHaveBeenCalled();
    });
  });

  describe('nested structures', () => {
    it('recurses through an object containing an array of objects', () => {
      mockFaker.number.int.mockReturnValueOnce(1); // one item in the array
      mockFaker.string.uuid.mockReturnValueOnce('55555555-5555-5555-5555-555555555555');
      mockFaker.internet.email.mockReturnValueOnce('nested@example.com');

      const result = generateFallbackPayload(
        schema({
          type: 'object',
          properties: {
            users: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  id: { type: 'string' },
                  email: { type: 'string' },
                },
              },
            },
          },
        })
      );

      expect(result).toEqual({
        users: [{ id: '55555555-5555-5555-5555-555555555555', email: 'nested@example.com' }],
      });
    });
  });
});
