export const HTTP_METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'] as const;
export type HttpMethod = (typeof HTTP_METHODS)[number];

export type JsonSchemaPrimitive = 'string' | 'number' | 'integer' | 'boolean' | 'array' | 'object';

export const STRING_FORMATS = ['email', 'uuid', 'date-time', 'uri'] as const;
export type StringFormat = (typeof STRING_FORMATS)[number];

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

export interface EndpointJsonSchema {
  body?: JsonSchemaDefinition;
  query?: JsonSchemaDefinition;
  response?: JsonSchemaDefinition;
}

export interface ApiConfigInput {
  endpointName: string;
  httpMethod: HttpMethod;
  jsonSchema: EndpointJsonSchema;
}

export interface ApiConfigDto {
  _id: string;
  endpointName: string;
  httpMethod: HttpMethod;
  jsonSchema: EndpointJsonSchema;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

// --- Phase 5: API Gateway (rate limiting + key management) ---

export const API_KEY_TIERS = ['free', 'pro'] as const;
export type ApiKeyTier = (typeof API_KEY_TIERS)[number];

/**
 * Per-minute throttle, enforced by the rate-limit middleware via Redis.
 * Guards against short bursts hitting the (expensive) AI generation path.
 */
export const TIER_RATE_LIMIT_PER_MINUTE: Record<ApiKeyTier, number> = {
  free: 50,
  pro: 1000,
};

/**
 * A separate concept from the per-minute throttle above: the dashboard's
 * "used vs. monthly limit" progress bar tracks usage against a plan's
 * included monthly volume, not the burst-protection rate limit. Real API
 * products distinguish these (e.g. "1000 req/min, 100k req/month included")
 * — the brief didn't specify monthly numbers, so these are reasonable,
 * clearly-labeled round numbers rather than a derived multiple of the
 * per-minute limit, which would produce awkward multi-million figures.
 */
export const TIER_MONTHLY_QUOTA: Record<ApiKeyTier, number> = {
  free: 10_000,
  pro: 250_000,
};

export interface ApiKeyInput {
  tier?: ApiKeyTier;
}

/**
 * Returned ONLY once, from the create-key endpoint's response — the one
 * moment the server ever has the plaintext key. It is never stored in
 * reversible form and can never be fetched again afterward.
 */
export interface ApiKeyCreatedDto {
  apiKey: string;
  keyPrefix: string;
  tier: ApiKeyTier;
  createdAt: string;
}

/** Wire shape for anything that isn't the one-time creation response — never carries the plaintext key. */
export interface ApiKeyDto {
  _id: string;
  keyPrefix: string;
  tier: ApiKeyTier;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ApiKeyUsageDto {
  tier: ApiKeyTier;
  used: number;
  limit: number;
  remaining: number;
  /** ISO timestamp for the start of next month, when the monthly counter resets. */
  periodResetsAt: string;
}
