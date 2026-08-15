import { z, type ZodTypeAny } from 'zod';
import type { JsonSchemaDefinition } from './types';

export interface JsonSchemaToZodOptions {
  /**
   * OpenAI's Structured Outputs strict mode requires every key in
   * `properties` to also appear in `required` — there's no native
   * "optional key" concept. The documented way to express optionality is to
   * make the field's type nullable instead, and let the model return `null`.
   * When true, fields absent from `required` are built as
   * `.nullable().optional()` instead of plain `.optional()`. Confirmed
   * against the live SDK: plain `.optional()` throws
   * "uses `.optional()` without `.nullable()`" when passed to
   * zodResponseFormat(). Default false preserves normal Zod semantics for
   * request validation (Phase 1's use of this function is unaffected).
   */
  openAiStrictMode?: boolean;
}

/**
 * Converts our stored JsonSchemaDefinition (plain data, e.g. loaded straight
 * out of MongoDB) into a live Zod schema. Used two ways:
 *  - Phase 1: validating an incoming client request against `body`/`query`.
 *  - Phase 2: building the schema handed to zodResponseFormat() so OpenAI's
 *    Structured Outputs constrains generation to `response`'s shape.
 */
export function jsonSchemaToZod(
  definition: JsonSchemaDefinition,
  options: JsonSchemaToZodOptions = {}
): ZodTypeAny {
  const schema = buildSchema(definition, options);
  return definition.description ? schema.describe(definition.description) : schema;
}

function buildSchema(definition: JsonSchemaDefinition, options: JsonSchemaToZodOptions): ZodTypeAny {
  switch (definition.type) {
    case 'string':
      return buildStringSchema(definition);
    case 'number':
    case 'integer':
      return buildNumberSchema(definition);
    case 'boolean':
      return z.boolean();
    case 'array':
      return z.array(definition.items ? jsonSchemaToZod(definition.items, options) : z.unknown());
    case 'object':
      return buildObjectSchema(definition, options);
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

function buildObjectSchema(definition: JsonSchemaDefinition, options: JsonSchemaToZodOptions): ZodTypeAny {
  const properties = definition.properties ?? {};
  const requiredFields = new Set(definition.required ?? []);
  const shape: Record<string, ZodTypeAny> = {};

  for (const [key, propertyDefinition] of Object.entries(properties)) {
    const propertySchema = jsonSchemaToZod(propertyDefinition, options);
    if (requiredFields.has(key)) {
      shape[key] = propertySchema;
    } else if (options.openAiStrictMode) {
      shape[key] = propertySchema.nullable().optional();
    } else {
      shape[key] = propertySchema.optional();
    }
  }

  return z.object(shape);
}
