import { Schema, model, type Document, type Model } from 'mongoose';
import { API_KEY_TIERS, type ApiKeyTier } from '@mock-api-engine/schema';

/**
 * The persisted shape of one API key.
 *
 * Deliberately stores `keyHash`, not `key` — the brief offered "hashed
 * ideally, or plain for this MVP" as if it were a style choice, but storing
 * API keys in plaintext is a real, well-known anti-pattern (a single DB
 * leak compromises every key at once), and hashing costs almost nothing
 * extra here. SHA-256 (not bcrypt/argon2) is the right tool for it: those
 * slow, salted algorithms exist to resist brute-forcing *low-entropy*
 * human-chosen passwords, but an API key is already 256 bits of random
 * data — brute-forcing the hash is infeasible regardless, so a fast hash is
 * both sufficient and appropriate for a check that runs on every request.
 */
export interface IApiKey {
  /** SHA-256 hash of the actual key. The plaintext is never stored. */
  keyHash: string;
  /** First several characters of the plaintext key, for display/identification only — never enough to reconstruct or brute-force the real key. */
  keyPrefix: string;
  tier: ApiKeyTier;
  /**
   * All-time count, for schema completeness / potential future audit use.
   * NOT updated synchronously by the rate-limit middleware on every
   * request — that would put a MongoDB write in the hot path of every
   * single mock-API call, the exact per-request DB round-trip this
   * project's whole caching architecture exists to avoid. Live,
   * request-scale usage tracking lives in Redis (see rate-limit.service.ts)
   * — this field is a placeholder for a future batch-sync job, not the
   * source GET /api/v1/keys/usage actually reads from.
   */
  usageCount: number;
  /** Soft revocation, consistent with ApiConfig's isActive pattern. */
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface IApiKeyDocument extends IApiKey, Document {}

const ApiKeySchema = new Schema<IApiKeyDocument>(
  {
    keyHash: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    keyPrefix: {
      type: String,
      required: true,
    },
    tier: {
      type: String,
      required: true,
      enum: { values: API_KEY_TIERS as unknown as string[], message: '{VALUE} is not a supported tier' },
      default: 'free',
    },
    usageCount: {
      type: Number,
      default: 0,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  { timestamps: true }
);

export const ApiKeyModel: Model<IApiKeyDocument> = model<IApiKeyDocument>('ApiKey', ApiKeySchema);
