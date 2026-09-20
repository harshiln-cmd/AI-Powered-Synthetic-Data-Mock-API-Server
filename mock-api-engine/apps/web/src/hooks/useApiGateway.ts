import { useCallback, useEffect, useState } from 'react';
import type { ApiKeyTier, ApiKeyUsageDto } from '@mock-api-engine/schema';
import { createApiKey, getApiKeyUsage } from '../services/gateway-client';

const STORAGE_KEY = 'mock-api-engine:gateway-key';

interface StoredKey {
  apiKey: string;
  keyPrefix: string;
  tier: ApiKeyTier;
}

/**
 * There is no user/auth system anywhere in this project, so there's no
 * server-side concept of "this browser's key" to fetch on page load — the
 * only way the server can identify a key at all is the key itself, via the
 * x-api-key header. So the full plaintext key is kept in localStorage,
 * scoped to this browser, and used both to display the masked key and to
 * authenticate the usage-stats request. This is a deliberate, flagged
 * trade-off, not an oversight: a real multi-tenant product would tie keys
 * to authenticated accounts instead.
 */
function loadStoredKey(): StoredKey | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as StoredKey) : null;
  } catch {
    return null;
  }
}

function saveStoredKey(value: StoredKey): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(value));
  } catch {
    // Non-fatal — the dashboard still works for this session, it just
    // won't survive a reload if storage is unavailable (private browsing, etc).
  }
}

interface UseApiGatewayResult {
  apiKey: string | null;
  keyPrefix: string | null;
  tier: ApiKeyTier | null;
  usage: ApiKeyUsageDto | null;
  isGenerating: boolean;
  isLoadingUsage: boolean;
  error: string | null;
  generateKey: (tier: ApiKeyTier) => Promise<void>;
  refreshUsage: () => void;
}

export function useApiGateway(): UseApiGatewayResult {
  const [stored, setStored] = useState<StoredKey | null>(() => loadStoredKey());
  const [usage, setUsage] = useState<ApiKeyUsageDto | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isLoadingUsage, setIsLoadingUsage] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reloadToken, setReloadToken] = useState(0);

  useEffect(() => {
    if (!stored) return;

    let cancelled = false;
    setIsLoadingUsage(true);
    setError(null);

    getApiKeyUsage(stored.apiKey)
      .then((result) => {
        if (!cancelled) setUsage(result);
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load usage stats.');
      })
      .finally(() => {
        if (!cancelled) setIsLoadingUsage(false);
      });

    return () => {
      cancelled = true;
    };
  }, [stored, reloadToken]);

  const generateKey = useCallback(async (tier: ApiKeyTier) => {
    setIsGenerating(true);
    setError(null);
    try {
      const created = await createApiKey({ tier });
      const next: StoredKey = { apiKey: created.apiKey, keyPrefix: created.keyPrefix, tier: created.tier };
      saveStoredKey(next);
      setStored(next);
      setUsage(null); // refetched by the effect above once `stored` changes
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to generate an API key.');
    } finally {
      setIsGenerating(false);
    }
  }, []);

  const refreshUsage = useCallback(() => setReloadToken((token) => token + 1), []);

  return {
    apiKey: stored?.apiKey ?? null,
    keyPrefix: stored?.keyPrefix ?? null,
    tier: stored?.tier ?? null,
    usage,
    isGenerating,
    isLoadingUsage,
    error,
    generateKey,
    refreshUsage,
  };
}
