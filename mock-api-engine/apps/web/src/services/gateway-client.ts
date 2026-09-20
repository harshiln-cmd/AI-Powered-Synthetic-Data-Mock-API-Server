import type { ApiKeyCreatedDto, ApiKeyUsageDto, CreateApiKeyInput } from '@mock-api-engine/schema';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:4000';

export class GatewayApiError extends Error {
  readonly status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = 'GatewayApiError';
    this.status = status;
  }
}

export async function createApiKey(input: CreateApiKeyInput): Promise<ApiKeyCreatedDto> {
  const response = await fetch(`${API_BASE_URL}/api/v1/keys`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });

  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new GatewayApiError(response.status, body.message ?? `Failed to create API key (${response.status})`);
  }
  return body.data as ApiKeyCreatedDto;
}

export async function getApiKeyUsage(apiKey: string): Promise<ApiKeyUsageDto> {
  const response = await fetch(`${API_BASE_URL}/api/v1/keys/usage`, {
    headers: { 'x-api-key': apiKey },
  });

  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new GatewayApiError(response.status, body.message ?? `Failed to fetch usage (${response.status})`);
  }
  return body.data as ApiKeyUsageDto;
}
