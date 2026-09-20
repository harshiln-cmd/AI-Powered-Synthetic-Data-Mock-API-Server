import { z } from 'zod';
import { HTTP_METHODS, STRING_FORMATS, API_KEY_TIERS, type JsonSchemaDefinition } from './types';

export const HttpMethodSchema = z.enum(HTTP_METHODS);

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

export const CreateEndpointConfigSchema = z.object({
  endpointName: z
    .string()
    .min(1, 'endpointName is required')
    .startsWith('/', { message: 'endpointName must start with "/" (e.g. "/api/users")' }),
  httpMethod: HttpMethodSchema,
  jsonSchema: EndpointJsonSchemaSchema,
});

export type CreateEndpointConfigInput = z.infer<typeof CreateEndpointConfigSchema>;

// --- Phase 5: API Gateway ---

export const CreateApiKeySchema = z.object({
  tier: z.enum(API_KEY_TIERS).optional().default('free'),
});

export type CreateApiKeyInput = z.infer<typeof CreateApiKeySchema>;
