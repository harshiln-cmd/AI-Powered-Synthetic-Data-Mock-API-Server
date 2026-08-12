import { z, type ZodTypeAny } from 'zod';
import type { JsonSchemaDefinition } from './types';

/**
 * Converts our stored JsonSchemaDefinition (plain data, e.g. loaded straight
 * out of MongoDB) into a live Zod schema. This is what makes "validate this
 * request against whatever schema the user uploaded" possible — the schema
 * itself isn't known until runtime, so it can't be written as a static
 * `z.object({...})` anywhere in the codebase.
 */
export function jsonSchemaToZod(definition: JsonSchemaDefinition): ZodTypeAny {
  switch (definition.type) {
    case 'string':
      return buildStringSchema(definition);
    case 'number':
    case 'integer':
      return buildNumberSchema(definition);
    case 'boolean':
      return z.boolean();
    case 'array':
      return z.array(definition.items ? jsonSchemaToZod(definition.items) : z.unknown());
    case 'object':
      return buildObjectSchema(definition);
    default:
      // Unknown/unsupported `type` values are rejected by CreateEndpointConfigSchema
      // before they ever reach here, so this is an unreachable safety net rather
      // than a path we expect to hit.
      return z.unknown();
  }
}

function buildStringSchema(definition: JsonSchemaDefinition): ZodTypeAny {
  // NOTE: enum is currently only wired up for strings — the overwhelming
  // majority of mock-validation use cases (status flags, roles, categories).
  // Numeric/mixed enums are a reasonable Phase 2+ extension if needed.
  if (definition.enum && definition.enum.length > 0) {
    return z.enum(definition.enum as [string, ...string[]]);
  }

  let schema = z.string();
  if (typeof definition.minLength === 'number') schema = schema.min(definition.minLength);
  if (typeof definition.maxLength === 'number') schema = schema.max(definition.maxLength);

  switch (definition.format) {
    case 'email':
      schema = schema.email();
      break;
    case 'uuid':
      schema = schema.uuid();
      break;
    case 'uri':
      schema = schema.url();
      break;
    case 'date-time':
      schema = schema.datetime();
      break;
    default:
      break;
  }

  return schema;
}

function buildNumberSchema(definition: JsonSchemaDefinition): ZodTypeAny {
  let schema = z.number();
  if (definition.type === 'integer') schema = schema.int();
  if (typeof definition.minimum === 'number') schema = schema.min(definition.minimum);
  if (typeof definition.maximum === 'number') schema = schema.max(definition.maximum);
  return schema;
}

function buildObjectSchema(definition: JsonSchemaDefinition): ZodTypeAny {
  const properties = definition.properties ?? {};
  const requiredFields = new Set(definition.required ?? []);
  const shape: Record<string, ZodTypeAny> = {};

  for (const [key, propertyDefinition] of Object.entries(properties)) {
    const propertySchema = jsonSchemaToZod(propertyDefinition);
    shape[key] = requiredFields.has(key) ? propertySchema : propertySchema.optional();
  }

  return z.object(shape);
}
