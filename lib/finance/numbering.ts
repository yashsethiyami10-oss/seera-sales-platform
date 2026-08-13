import { createHash } from "node:crypto";

// Same deterministic-from-idempotencyKey numbering pattern already used by
// lib/sales-distribution/financial-service.ts's numberFor() — reused here so
// every Finance OS document series follows one convention across the app.
export const financeNumberFor = (prefix: string, key: string) =>
  `${prefix}-${createHash("sha256").update(key).digest("hex").slice(0, 16).toUpperCase()}`;
