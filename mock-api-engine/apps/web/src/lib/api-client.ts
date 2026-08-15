import type { ApiConfigDto, CreateEndpointConfigInput } from '@mock-api-engine/schema';
import type { ZodIssueLike } from './format-zod-issues';

// Matches apps/api's PORT default exactly — see apps/api/.env.example.
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:4000';

interface ErrorBody {
  error?: string;
  message?: string;
  issues?: ZodIssueLike[];
}

/** Carries whatever apps/api's error responses actually send — a plain message, or Zod issues from the 400 validation path. */
export class ApiError extends Error {
  readonly status: number;
  readonly issues?: ZodIssueLike[];

  constructor(status: number, body: ErrorBody) {
    super(body.message ?? body.error ?? `Request failed with status ${status}`);
    this.name = 'ApiError';
    this.status = status;
    this.issues = body.issues;
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...init?.headers },
  });

  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as ErrorBody;
    throw new ApiError(response.status, body);
  }

  return (await response.json()) as T;
}

export async function listEndpoints(): Promise<ApiConfigDto[]> {
  const result = await request<{ success: boolean; count: number; data: ApiConfigDto[] }>('/admin/endpoints');
  return result.data;
}

export async function createEndpoint(input: CreateEndpointConfigInput): Promise<ApiConfigDto> {
  const result = await request<{ success: boolean; data: ApiConfigDto }>('/admin/endpoints', {
    method: 'POST',
    body: JSON.stringify(input),
  });
  return result.data;
}
