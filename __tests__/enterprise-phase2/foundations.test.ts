import { describe, expect, it } from "vitest";
import {
  PHASE2_FEATURE_FLAGS,
  assertLifecycleTransition,
  requestFingerprint,
  selectEffectivePolicy,
  validateEffectiveRange,
} from "@/lib/enterprise-phase2/foundation";
import {
  assertNotificationEvent,
  assertWorkflowSubject,
} from "@/lib/enterprise-phase2/adapters";
import {
  phase2OperationSchema,
  phase2PolicyVersionSchema,
  phase2SourceReferenceSchema,
} from "@/lib/validations/enterprise-phase2";

describe("Enterprise Phase 2 shared foundations", () => {
  it("registers every Phase 2 feature boundary without enabling it in code", () => {
    // 9 Part 3A/3B flags + Part 3C Wave 1's additive
    // ENTERPRISE_FINANCE_AI_ADAPTER_ENABLED (Section 36's advisory-only
    // Finance AI adapter extension point).
    expect(PHASE2_FEATURE_FLAGS).toHaveLength(10);
    expect(PHASE2_FEATURE_FLAGS.every((flag) => flag.endsWith("_ENABLED"))).toBe(true);
  });

  it("rejects cross-organization source and operation input", () => {
    expect(() => phase2SourceReferenceSchema.parse({
      organizationKey: "OTHER",
      sourceDomain: "ORDER",
      sourceEntityType: "Order",
      sourceEntityId: "1",
    })).toThrow();
    expect(() => phase2OperationSchema.parse({
      organizationKey: "OTHER",
      operationType: "POST",
      idempotencyKey: "request-0001",
      correlationId: crypto.randomUUID(),
    })).toThrow();
  });

  it("validates lifecycle transitions deterministically", () => {
    const transitions = { DRAFT: ["PENDING_APPROVAL"], PENDING_APPROVAL: ["FINALIZED", "REJECTED"] };
    expect(() => assertLifecycleTransition("DRAFT", "PENDING_APPROVAL", transitions)).not.toThrow();
    expect(() => assertLifecycleTransition("DRAFT", "FINALIZED", transitions)).toThrow("Invalid lifecycle transition");
  });

  it("validates effective ranges and selects the highest finalized effective version", () => {
    const at = new Date("2026-07-01T00:00:00Z");
    expect(() => validateEffectiveRange(at, new Date("2026-06-01T00:00:00Z"))).toThrow();
    expect(() => phase2PolicyVersionSchema.parse({
      organizationKey: "MUV",
      policyType: "TEST",
      policyKey: "PRIMARY",
      version: 1,
      effectiveFrom: "2026-07-02",
      effectiveTo: "2026-07-01",
      configuration: {},
    })).toThrow();
    const selected = selectEffectivePolicy([
      { version: 1, status: "FINALIZED", effectiveFrom: new Date("2026-01-01"), effectiveTo: null },
      { version: 2, status: "DRAFT", effectiveFrom: new Date("2026-06-01"), effectiveTo: null },
      { version: 3, status: "FINALIZED", effectiveFrom: new Date("2026-06-01"), effectiveTo: null },
    ], at);
    expect(selected?.version).toBe(3);
  });

  it("creates stable request fingerprints", () => {
    expect(requestFingerprint({ amount: 100, currency: "INR" }))
      .toBe(requestFingerprint({ amount: 100, currency: "INR" }));
    expect(requestFingerprint({ amount: 100 })).not.toBe(requestFingerprint({ amount: 101 }));
  });

  it("fails closed for unregistered workflow and notification subjects", () => {
    expect(() => assertWorkflowSubject("MANUAL_JOURNAL")).not.toThrow();
    expect(() => assertWorkflowSubject("UNREGISTERED")).toThrow();
    expect(() => assertNotificationEvent("PAYMENT_DUE")).not.toThrow();
    expect(() => assertNotificationEvent("UNREGISTERED")).toThrow();
  });
});
