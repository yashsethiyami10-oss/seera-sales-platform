/**
 * MUV AI — Knowledge Retrieval Core (KRC, Module 5) caching interface.
 *
 * "Create caching interfaces only... do not require Redis now... keep
 * provider-agnostic" — this is the same shape this codebase already uses
 * for shipping/messaging providers (lib/shipping/index.ts,
 * lib/messaging/index.ts): a shared interface, one real implementation
 * today, and a factory function that would switch on an env var once a
 * second (Redis) implementation exists. `getRetrievalCache()` is that
 * factory — it currently only ever returns `InMemoryRetrievalCache`.
 *
 * Same disclosed limitation as lib/rate-limit.ts: in-process memory, fine
 * for a single server instance, resets on deploy/restart, and doesn't
 * share state across multiple instances. Swap in a Redis-backed
 * implementation of this same `RetrievalCache` interface before scaling
 * beyond one server — call sites (lib/retrieval/pipeline.ts) don't change.
 */

export interface RetrievalCache {
  get<T>(key: string): Promise<T | null>;
  set<T>(key: string, value: T, ttlMs?: number): Promise<void>;
  has(key: string): Promise<boolean>;
  clear(key?: string): Promise<void>;
}

type CacheEntry = { value: unknown; expiresAt: number | null };

export class InMemoryRetrievalCache implements RetrievalCache {
  private store = new Map<string, CacheEntry>();

  async get<T>(key: string): Promise<T | null> {
    const entry = this.store.get(key);
    if (!entry) return null;
    if (entry.expiresAt !== null && entry.expiresAt < Date.now()) {
      this.store.delete(key);
      return null;
    }
    return entry.value as T;
  }

  async set<T>(key: string, value: T, ttlMs?: number): Promise<void> {
    this.store.set(key, { value, expiresAt: ttlMs ? Date.now() + ttlMs : null });
  }

  async has(key: string): Promise<boolean> {
    return (await this.get(key)) !== null;
  }

  async clear(key?: string): Promise<void> {
    if (key) this.store.delete(key);
    else this.store.clear();
  }
}

let cacheInstance: RetrievalCache | null = null;

/** Provider-agnostic accessor — every call site should go through this,
 * never instantiate InMemoryRetrievalCache directly, so swapping the
 * provider later is a one-line change here. */
export function getRetrievalCache(): RetrievalCache {
  if (!cacheInstance) cacheInstance = new InMemoryRetrievalCache();
  return cacheInstance;
}

/** Deterministic cache key from a retrieval context — same context,
 * same key, regardless of object-key ordering. */
export function buildCacheKey(action: string, context: unknown, clearance: string): string {
  return `${action}:${clearance}:${JSON.stringify(context, Object.keys(context as object).sort())}`;
}
