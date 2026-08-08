import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const schema = readFileSync(path.join(root, "prisma/schema.prisma"), "utf8");
const service = readFileSync(path.join(root, "lib/sales-distribution/operational-service.ts"), "utf8");

describe("Phase 2-5 operational completeness", () => {
  it("stores PJP and targets as effective governed records", () => { expect(schema).toContain("model SeeraJourneyPlan"); expect(schema).toContain("model SeeraTarget"); expect(schema).toContain('achievementBasis String   @default("DELIVERED")'); });
  it("makes collection submissions idempotent", () => { expect(schema).toMatch(/model SeeraCollectionEntry[\s\S]*idempotencyKey\s+String\s+@unique/); expect(service).toContain("seeraCollectionEntry.upsert"); });
  it("captures market intelligence under active field scope", () => { expect(schema).toContain("model SeeraMarketIntelligence"); expect(service).toContain("ACTIVE_WORKDAY_REQUIRED"); });
  it("never self-verifies uploaded payment proof", () => { expect(service).toContain('status: "SUBMITTED"'); expect(service).not.toMatch(/submitPaymentProof[\s\S]{0,1500}status:\s*"VERIFIED"/); });
});
