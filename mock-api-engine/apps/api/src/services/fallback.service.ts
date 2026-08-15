import { faker } from '@faker-js/faker';
import type { JsonSchemaDefinition } from '@mock-api-engine/schema';

/**
 * rules.md "Fallback Strategy": if the LLM API times out or hits rate
 * limits, the system MUST fall back to a local static dummy generator. This
 * is that generator — pure, synchronous, no network calls, so it's always
 * available regardless of what's wrong with the AI provider.
 *
 * It walks the same JsonSchemaDefinition the AI service is given, so the
 * shape of a fallback payload always matches the shape of a real one.
 */
export function generateFallbackPayload(definition: JsonSchemaDefinition): unknown {
  switch (definition.type) {
    case 'string':
      return fakeString(definition);
    case 'number':
      return faker.number.float({ min: definition.minimum ?? 0, max: definition.maximum ?? 1000, fractionDigits: 2 });
    case 'integer':
      return faker.number.int({ min: definition.minimum ?? 0, max: definition.maximum ?? 1000 });
    case 'boolean':
      return faker.datatype.boolean();
    case 'array':
      return Array.from({ length: faker.number.int({ min: 1, max: 3 }) }, () =>
        definition.items ? generateFallbackPayload(definition.items) : null
      );
    case 'object':
      return buildFakeObject(definition);
    default:
      return null;
  }
}

function fakeString(definition: JsonSchemaDefinition): string {
  if (definition.enum && definition.enum.length > 0) {
    return faker.helpers.arrayElement(definition.enum);
  }
  switch (definition.format) {
    case 'email':
      return faker.internet.email();
    case 'uuid':
      return faker.string.uuid();
    case 'uri':
      return faker.internet.url();
    case 'date-time':
      return faker.date.recent().toISOString();
    default:
      return faker.lorem.words({ min: 2, max: 4 });
  }
}

function buildFakeObject(definition: JsonSchemaDefinition): Record<string, unknown> {
  const properties = definition.properties ?? {};
  const result: Record<string, unknown> = {};
  for (const [key, propertyDefinition] of Object.entries(properties)) {
    result[key] = fakeValueForKey(key, propertyDefinition);
  }
  return result;
}

/**
 * Light field-name heuristics so a fallback payload at least *looks*
 * plausible even when the stored schema didn't set an explicit `format`
 * (e.g. a plain `{ "type": "string" }` field literally named "email").
 */
function fakeValueForKey(key: string, definition: JsonSchemaDefinition): unknown {
  if (definition.type === 'string' && !definition.format && !definition.enum) {
    const lowerKey = key.toLowerCase();
    if (lowerKey.includes('email')) return faker.internet.email();
    if (lowerKey === 'id' || lowerKey.endsWith('id')) return faker.string.uuid();
    if (lowerKey.includes('name')) return faker.person.fullName();
    if (lowerKey.includes('phone')) return faker.phone.number();
    if (lowerKey.includes('url') || lowerKey.includes('website')) return faker.internet.url();
    if (lowerKey.includes('address')) return faker.location.streetAddress();
  }
  return generateFallbackPayload(definition);
}
