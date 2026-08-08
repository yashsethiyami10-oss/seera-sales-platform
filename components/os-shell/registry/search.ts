import type { AppId } from "./types";

/**
 * MUV OS™ — Core Platform Foundation (Milestone 1), Search Registration
 * Model (Manifest Architecture §5).
 *
 * `SearchProvider` is the contract a future App registers to make its
 * entities searchable — MUV OS never indexes App data itself (§5). The
 * function signature is deliberately engine-agnostic (a plain async query
 * function): whether a given App backs it with a live DB query or a real
 * search index is that App's own choice, not something this contract
 * dictates, exactly as §5 requires.
 */
export interface SearchResultItem {
  id: string;
  ownerAppId: AppId;
  /** e.g. "Customer", "Order" — carried so results can be permission-filtered before display (§5). */
  entityType: string;
  title: string;
  subtitle?: string;
  href: string;
  /** A declarative reference only, checked before the result is ever shown — never executed logic. */
  requiredPermission?: string;
  /** Provider-supplied hint only; MUV OS's aggregator (a future file) does final cross-provider ranking, per §5. */
  relevanceHint?: number;
}

export interface SearchProvider {
  ownerAppId: AppId;
  search: (query: string) => Promise<SearchResultItem[]>;
}

/**
 * Every registered App's search provider. Empty today — see
 * `registry/navigation.ts`'s `getNavRegistry` for why: Milestone 1 builds
 * the platform search UI and this exact contract, not any App with real
 * entities to search over.
 */
export function getSearchProviders(): readonly SearchProvider[] {
  return [];
}
