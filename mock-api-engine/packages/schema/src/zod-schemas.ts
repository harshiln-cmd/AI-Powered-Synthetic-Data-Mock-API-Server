import { z } from 'zod';
import { HTTP_METHODS, STRING_FORMATS, type JsonSchemaDefinition } from './types';

export const HttpMethodSchema = z.enum(HTTP_METHODS);

/**
 * Recursive Zod schema mirroring JsonSchemaDefinition. Recursive shapes need
 * `z.lazy()` plus an explicit `z.ZodType<T>` annotation — Zod/TS can't infer
 * the recursive type on their own.
 */
export const JsonSchemaDefinitionSchema: z.ZodType<JsonSchemaDefinition> = z.lazy(() =>
  z.object({
    type: z.enum(['string', 'number', 'integer', 'boolean', 'array', 'object']),
    properties: z.record(z.string(), JsonSchemaDefinitionSchema).optional(),
    required: z.array(z.string()).optional(),
    items: JsonSchemaDefinitionSchema.optional(),
    enum: z.array(z.string()).optional(),
    format: z.enum(STRING_FORMATS).optional(),
    minLength: z.number().nonnegative().optional(),
    maxLength: z.number().nonnegative().optional(),
    minimum: z.number().optional(),
    maximum: z.number().optional(),
    description: z.string().optional(),
  })
);

export const EndpointJsonSchemaSchema = z.object({
  body: JsonSchemaDefinitionSchema.optional(),
  query: JsonSchemaDefinitionSchema.optional(),
  response: JsonSchemaDefinitionSchema.optional(),
});

/** Validates the body of POST /admin/endpoints. */
export const CreateEndpointConfigSchema = z.object({
  endpointName: z
    .string()
    .min(1, 'endpointName is required')
    .startsWith('/', { message: 'endpointName must start with "/" (e.g. "/api/users")' }),
  httpMethod: HttpMethodSchema,
  jsonSchema: EndpointJsonSchemaSchema,
});

export type CreateEndpointConfigInput = z.infer<typeof CreateEndpointConfigSchema>;
