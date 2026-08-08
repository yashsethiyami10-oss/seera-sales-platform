import { unstable_cache as nextCache, revalidateTag } from "next/cache";

/**
 * Caching strategy for this app:
 *
 * - Public, cacheable reads (product catalog, blog, homepage content) are
 *   wrapped in `unstable_cache` with a *tag*, not just a time-based revalidate
 *   window — because the correct invalidation moment is "an admin just
 *   edited this," not "60 seconds happened to pass." A stale product price
 *   for a fixed TTL is a worse failure mode than a cache that's invalidated
 *   a little too eagerly.
 * - Every Server Action that mutates a cached entity calls `revalidateTag`
 *   for that entity's tag in the same request — see CACHE_TAGS below and
 *   grep for `revalidateTag(CACHE_TAGS` across app/actions/*.ts.
 * - Authenticated, per-user reads (orders, wishlist, account data) are never
 *   wrapped in this cache — they're cheap, personal, and must always be
 *   current.
 *
 * In production, swap `unstable_cache`'s default in-memory/filesystem store
 * for Redis-backed caching (e.g. via a custom Next.js cache handler,
 * `cacheHandler` in next.config.js) once running more than one server
 * instance — otherwise each instance caches independently and a mutation on
 * instance A won't invalidate instance B's copy.
 */

export const CACHE_TAGS = {
  products: "products",
  product: (slug: string) => `product:${slug}`,
  categories: "categories",
  homepage: "homepage", // banners + sections + announcement + newsletter + best sellers
  blogList: "blog-list",
  blogPost: (slug: string) => `blog-post:${slug}`,
} as const;

/** Thin wrapper so call sites don't repeat the `unstable_cache` signature. */
export function cached<T extends (...args: any[]) => Promise<any>>(
  fn: T,
  keyParts: string[],
  tags: string[],
  revalidateSeconds = 300 // safety-net TTL even if a tag invalidation is ever missed
) {
  return nextCache(fn, keyParts, { tags, revalidate: revalidateSeconds });
}

export function invalidate(...tags: string[]) {
  for (const tag of tags) revalidateTag(tag);
}
