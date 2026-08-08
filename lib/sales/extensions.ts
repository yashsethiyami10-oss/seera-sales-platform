export type SalesExtension =
  | "dealer-management" | "distributor-management" | "franchise-management"
  | "corporate-sales" | "key-account-management" | "sales-analytics"
  | "sales-operations" | "muv-ai";

export interface SalesExtensionProvider {
  readonly key: SalesExtension;
  readonly enabled: false;
}

// Registration boundary only. Version 1 intentionally ships no extension logic.
export const reservedSalesExtensions: readonly SalesExtensionProvider[] = [
  "dealer-management", "distributor-management", "franchise-management",
  "corporate-sales", "key-account-management", "sales-analytics",
  "sales-operations", "muv-ai",
].map((key) => ({ key: key as SalesExtension, enabled: false as const }));

export const MUV_AI_INTEGRATION_ENABLED = false as const;
export const MUV_AI_INTEGRATION_EVENT = "MUV_AI_INTEGRATION_EVENT" as const;

export interface MuvAiIntegrationExtension {
  readonly enabled: false;
  readonly eventType: typeof MUV_AI_INTEGRATION_EVENT;
}
