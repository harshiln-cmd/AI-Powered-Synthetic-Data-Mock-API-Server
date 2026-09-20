import crypto from 'node:crypto';
import { ApiKeyModel, type IApiKeyDocument } from '../models/api-key.model';
import type { ApiKeyTier } from '@mock-api-engine/schema';

const KEY_PREFIX = 'mk_live_';
const KEY_DISPLAY_PREFIX_LENGTH = 12; // e.g. "mk_live_a1B2" — identifies a key without exposing it
const CACHE_TTL_MS = 30_000;

export function generateRawApiKey(): string {
  // 32 random bytes = 256 bits of entropy, base64url-encoded so it's safe
  // to put in a header/URL with no escaping. Comparable to how GitHub/Stripe
  // size their own API keys.
  return `${KEY_PREFIX}${crypto.randomBytes(32).toString('base64url')}`;
}

export function hashApiKey(rawKey: string): string {
  return crypto.createHash('sha256').update(rawKey).digest('hex');
}

export function getKeyDisplayPrefix(rawKey: string): string {
  return rawKey.slice(0, KEY_DISPLAY_PREFIX_LENGTH);
}

/**
 * Generates, hashes, and persists a new key. Returns the plaintext once —
 * callers (the create-key controller) are responsible for returning it to
 * the client immediately, since it is never recoverable after this call
 * returns.
 */
export async function createApiKey(tier: ApiKeyTier): Promise<{ rawKey: string; document: IApiKeyDocument }> {
  const rawKey = generateRawApiKey();
  const keyHash = hashApiKey(rawKey);
  const keyPrefix = getKeyDisplayPrefix(rawKey);

  const document = await ApiKeyModel.create({ keyHash, keyPrefix, tier });
  cacheApiKeyDocument(document);

  return { rawKey, document };
}

// ---------------------------------------------------------------------------
// In-memory lookup cache — same motivation as route-registry.service.ts:
// avoid a MongoDB round-trip in the hot path of every single mock-API
// request. Unlike the route registry, entries here carry a short TTL rather
// than living until explicitly updated: in a horizontally-scaled deployment,
// a key created or revoked on one instance becomes visible to the others
// within CACHE_TTL_MS, rather than only after a restart. That's a
// deliberately bounded staleness window, not a correctness guarantee for
// every instant.
// ---------------------------------------------------------------------------

interface CacheEntry {
  document: IApiKeyDocument;
  cachedAt: number;
}

const keyCache = new Map<string, CacheEntry>();

function cacheApiKeyDocument(document: IApiKeyDocument): void {
  keyCache.set(document.keyHash, { document, cachedAt: Date.now() });
}

/**
 * Looks up an API key document by its plaintext value (hashing it first —
 * the database is never queried by plaintext). Returns null for a key that
 * doesn't exist or has been deactivated. Lets errors from the underlying
 * Mongo query propagate rather than swallowing them — the caller (the
 * rate-limit middleware) decides what an infrastructure failure here should
 * mean for the response.
 */
export async function lookupApiKeyByRawKey(rawKey: string): Promise<IApiKeyDocument | null> {
  const keyHash = hashApiKey(rawKey);
  const cached = keyCache.get(keyHash);

  if (cached && Date.now() - cached.cachedAt < CACHE_TTL_MS) {
    return cached.document;
  }

  const document = await ApiKeyModel.findOne({ keyHash, isActive: true });

  if (document) {
    cacheApiKeyDocument(document);
  } else {
    keyCache.delete(keyHash); // drop a stale entry if the key was revoked since it was cached
  }

  return document;
}

/** Test/ops escape hatch, mirroring route-registry.service.ts's clearRegistry(). */
export function clearApiKeyCache(): void {
  keyCache.clear();
}
