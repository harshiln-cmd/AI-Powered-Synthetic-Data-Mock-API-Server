import { useCallback, useEffect, useState } from 'react';
import type { ApiConfigDto, CreateEndpointConfigInput } from '@mock-api-engine/schema';
import { listEndpoints, createEndpoint as createEndpointRequest } from '../lib/api-client';

interface UseEndpointsResult {
  endpoints: ApiConfigDto[];
  isLoading: boolean;
  error: string | null;
  refetch: () => void;
  createEndpoint: (input: CreateEndpointConfigInput) => Promise<ApiConfigDto>;
}

export function useEndpoints(): UseEndpointsResult {
  const [endpoints, setEndpoints] = useState<ApiConfigDto[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadToken, setReloadToken] = useState(0);

  useEffect(() => {
    let cancelled = false;

    setIsLoading(true);
    setError(null);

    listEndpoints()
      .then((data) => {
        if (!cancelled) setEndpoints(data);
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load endpoints.');
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [reloadToken]);

  const refetch = useCallback(() => setReloadToken((token) => token + 1), []);

  // Prepend on success rather than refetching — the create call already
  // returns the full created record, so a second round trip just for a
  // fresh list would be a pointless wait for something the form already has.
  const createEndpoint = useCallback(async (input: CreateEndpointConfigInput) => {
    const created = await createEndpointRequest(input);
    setEndpoints((current) => [created, ...current]);
    return created;
  }, []);

  return { endpoints, isLoading, error, refetch, createEndpoint };
}
