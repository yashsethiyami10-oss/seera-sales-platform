import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

// Regression (2026-10-14): placeRetailerOrder's interactive transaction failed with P2028 "Transaction
// already closed" at ~12.7s against TEST Neon (checkout-idempotency test P) under a 10s budget, the third
// time this budget proved too tight (5.8s, 8.4s, 12.7s). Both order transactions must keep >= 20s.
const source = readFileSync(path.resolve(__dirname, "../../lib/sales-distribution/workflow-service.ts"), "utf8");

function transactionTimeoutFor(fn: string) {
  const start = source.indexOf(`export async function ${fn}(`);
  expect(start).toBeGreaterThan(-1);
  const next = source.indexOf("\nexport async function ", start + 1);
  const body = source.slice(start, next === -1 ? undefined : next);
  const match = body.match(/\$transaction\([\s\S]*?\},\s*\{[\s\S]*?timeout:\s*([\d_]+)/);
  expect(match, `${fn} must pass explicit transaction options`).not.toBeNull();
  return Number(match![1].replace(/_/g, ""));
}

describe("order transaction time budget", () => {
  for (const fn of ["placeRetailerOrder", "fulfilRetailerOrder"]) {
    it(`${fn} allows at least 20s`, () => {
      expect(transactionTimeoutFor(fn)).toBeGreaterThanOrEqual(20_000);
    });
  }
});
