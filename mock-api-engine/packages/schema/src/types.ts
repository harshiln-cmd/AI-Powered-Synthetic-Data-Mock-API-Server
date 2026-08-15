/**
 * These are plain TypeScript types (no Zod) so they can be imported by any
 * package — including the future React dashboard in Phase 3 — without
 * pulling Zod into a bundle that doesn't need runtime validation.
 */

export const HTTP_METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'] as const;
export type HttpMethod = (typeof HTTP_METHODS)[number];

export type JsonSchemaPrimitive = 'string' | 'number' | 'integer' | 'boolean' | 'array' | 'object';

export const STRING_FORMATS = ['email', 'uuid', 'date-time', 'uri'] as const;
export type StringFormat = (typeof STRING_FORMATS)[number];

/**
 * A deliberately small subset of JSON Schema. It covers the shapes we need
 * for mock request validation (Phase 1) without dragging in a full JSON
 * Schema implementation. `enum` is currently only honored for `type: "string"`
 * — see json-schema-to-zod.ts.
 */
export interface JsonSchemaDefinition {
  type: JsonSchemaPrimitive;
  properties?: Record<string, JsonSchemaDefinition>;
  required?: string[];
  items?: JsonSchemaDefinition;
  enum?: string[];
  format?: StringFormat;
  minLength?: number;
  maxLength?: number;
  minimum?: number;
  maximum?: number;
  description?: string;
}

/**
 * The full validation/generation contract stored per-endpoint.
 * - `body` / `query`: validate what the CLIENT sends (Phase 1, unchanged).
 * - `response`: describes the shape of the payload the mock server should
 *   generate and return (Phase 2). Kept separate from `body`/`query`
 *   because a request schema and a response schema are different concerns
 *   — e.g. a GET has no body to validate but still needs a response shape.
 */
export interface EndpointJsonSchema {
  body?: JsonSchemaDefinition;
  query?: JsonSchemaDefinition;
  response?: JsonSchemaDefinition;
}

/** Shape of the payload accepted by POST /admin/endpoints. */
export interface ApiConfigInput {
  endpointName: string;
  httpMethod: HttpMethod;
  jsonSchema: EndpointJsonSchema;
}
