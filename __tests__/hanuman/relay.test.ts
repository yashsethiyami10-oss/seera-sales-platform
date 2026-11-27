import { describe, expect, it } from "vitest";
import { createHmac } from "node:crypto";
import { assertReadOnlySql, hanumanSignatureOk } from "@/lib/hanuman/read-query";

describe("Hanuman read-only relay (Seera)", () => {
  it("accepts only a correctly signed body", () => {
    const raw = JSON.stringify({ op: "query", sql: "SELECT 1", ts: Date.now() });
    const sig = "sha256=" + createHmac("sha256", "s1").update(raw).digest("hex");
    expect(hanumanSignatureOk(raw, sig, "s1")).toBe(true);
    expect(hanumanSignatureOk(raw, sig, "other")).toBe(false);
    expect(hanumanSignatureOk(raw, sig, undefined)).toBe(false);
    expect(hanumanSignatureOk(raw, null, "s1")).toBe(false);
  });
  it("allows one SELECT only", () => {
    expect(() => assertReadOnlySql(`SELECT count(*) FROM "SeeraSalesOrder"`)).not.toThrow();
    for (const sql of [`DELETE FROM "SeeraPartner"`, `SELECT 1; SELECT 2`, `SELECT set_config('statement_timeout','0',false)`, `WITH d AS (UPDATE "SeeraPartner" SET name='x' RETURNING 1) SELECT * FROM d`]) expect(() => assertReadOnlySql(sql), sql).toThrow();
  });
});
