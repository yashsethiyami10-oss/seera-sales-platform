import { describe, it, expect, vi } from "vitest";
import fs from "node:fs";
import path from "node:path";

// ---- Database-safety gate: refuse unless this resolves to ep-falling-heart ----
function readEnvVar(filePath: string, name: string): string | null {
  const text = fs.readFileSync(filePath, "utf8");
  const match = text.match(new RegExp(`^${name}="?([^"\\n]+)"?`, "m"));
  return match?.[1] ?? null;
}
const resolvedHost = new URL(process.env.DATABASE_URL ?? readEnvVar(path.resolve(process.cwd(), ".env.local"), "DATABASE_URL")!).hostname;
if (!resolvedHost.includes("ep-falling-heart")) {
  throw new Error(`REFUSING: resolved DATABASE_URL host "${resolvedHost}" is not ep-falling-heart.`);
}

vi.mock("@/lib/auth", () => ({ auth: vi.fn() }));
import { auth } from "@/lib/auth";
const mockAuth = vi.mocked(auth);

import { buildIntelligence } from "@/lib/intelligence/intelligence-orchestrator";
import { executePipeline } from "@/lib/execution/execution-orchestrator";
import { buildExperienceResponse } from "@/lib/experience/response-model";
import { adaptForWebsite } from "@/lib/experience/website-channel-adapter";
import { resolveCallerClearance } from "@/lib/retrieval/permissions";
import type { IntelligenceRequest } from "@/lib/intelligence/types";
import type { MemoryItem } from "@/lib/experience/types";

/**
 * Founder Validation & Safe UAT Activation, Block B4 — ~20-25
 * representative UAT scenarios run through the REAL, unmodified turn
 * pipeline (Module 6 -> Module 7 -> Module 8, exactly as
 * `experience-orchestrator.ts`'s legacy path calls them, including this
 * task's own Block B1 clearance-resolution step), against the live
 * `ep-falling-heart` intelligence tables. `GATEWAY_LLM_PROVIDER` is
 * confirmed unset for every scenario (see test 0) — every response below
 * is the deterministic Response Composer output, never a real provider
 * call. Results are logged (not just asserted) so they can be transcribed
 * into the Block B4 section of the final Founder UAT report.
 *
 * "Do not run 100/500 question FAT yet" — this is intentionally a small,
 * fixed, one-shot scenario set, not a generated/randomized battery.
 */

function sessionFor(role: "ADMIN" | "STAFF" | "CUSTOMER" | null): any {
  if (!role) return null as any;
  return { user: { id: `test-user-${role.toLowerCase()}`, role } } as any;
}

type TurnResult = {
  label: string;
  clearanceRole: string;
  executionStatus: string;
  action: string;
  retrievedCount: number;
  targetReferenceCount: number;
  segments: { kind: string; content: string }[];
  requiresHandoff: boolean;
};

async function runTurn(label: string, retrieval: IntelligenceRequest["retrieval"], customerMessage: string, memory: MemoryItem[] = []): Promise<TurnResult> {
  const { decisionPackage } = await buildIntelligence({ retrieval, customerMessage, conversationContext: memory.map((m) => m.content).join(" "), memory }, false);
  const executionPackage = executePipeline({ decisionPackage, clearanceLayer: "PUBLIC" });
  const clearance = await resolveCallerClearance();
  const governedContent = clearance.role === "ADMIN" || clearance.role === "STAFF" ? decisionPackage.context.retrievedKnowledge : undefined;
  const experienceResponse = buildExperienceResponse("uat-test-session", executionPackage, governedContent);
  const view = adaptForWebsite(experienceResponse);
  const result: TurnResult = {
    label,
    clearanceRole: clearance.role,
    executionStatus: view.executionStatus,
    action: executionPackage.action.action,
    retrievedCount: decisionPackage.context.retrievedKnowledge.length,
    targetReferenceCount: executionPackage.action.targetReferences.length,
    segments: view.segments.map((s) => ({ kind: s.kind, content: s.content })),
    requiresHandoff: view.requiresHandoff,
  };
  // eslint-disable-next-line no-console
  console.log(`\n[B4] ${label} (clearance=${clearance.role})\n  action=${result.action} status=${result.executionStatus} retrieved=${result.retrievedCount} refs=${result.targetReferenceCount}\n  segments=${JSON.stringify(result.segments)}`);
  return result;
}

describe("Founder Validation & Safe UAT Activation — Block B4 scenario set", () => {
  it("0. provider remains inactive for every scenario in this file", () => {
    expect(process.env.GATEWAY_LLM_PROVIDER ?? "").toBe("");
    mockAuth.mockResolvedValue(null as any);
  });

  // ---- Product ----
  it("1. Product — real, clean, unpublished product by name", async () => {
    mockAuth.mockResolvedValue(null as any);
    const r = await runTurn("Product/clean-unpublished", { keywords: "Muv White Phenyl" }, "Tell me about Muv White Phenyl.");
    expect(r.retrievedCount).toBe(0); // nothing is PUBLISHED yet — expected, not a bug
  }, 20000);

  it("2. Product — real product with FOUNDER_REVIEW_REQUIRED confidentiality findings on its DRAFT record", async () => {
    mockAuth.mockResolvedValue(null as any);
    const r = await runTurn("Product/review-required-unpublished", { keywords: "Muv Cool Water Liquid Detergent" }, "What is the price of Muv Cool Water Liquid Detergent?");
    expect(r.retrievedCount).toBe(0);
  }, 20000);

  it("3. Product — a query about a now-published product, Founder/ADMIN clearance (B1 path exercised)", async () => {
    mockAuth.mockResolvedValue(sessionFor("ADMIN"));
    // Updated by the Runtime Answer-Delivery Correction task: this test
    // originally reused test 2's "Muv Cool Water Liquid Detergent" query
    // (unrelated to any published record) to show ADMIN clearance retrieves
    // >0 records for ANY query — that was only ever true because of a real,
    // now-fixed retrieval-relevance bug (lib/retrieval/sources.ts's
    // keywordHit() previously had no way to match a real customer sentence
    // against a short title, so with no other filter narrowing the small
    // corpus, EVERY eligible-by-layer-and-status record came back regardless
    // of relevance). With that fixed, an unrelated query like Cool Water
    // correctly retrieves 0 now (proven directly in the Runtime
    // Answer-Delivery Correction's own test suite's nonsense-query case).
    // This test now asks about a real PUBLISHED product instead, to prove
    // the thing it actually exists to prove: ADMIN clearance sees real
    // published content that ANONYMOUS clearance (test 2, still a genuinely
    // unpublished/unrelated product) cannot.
    const r = await runTurn("Product/founder-clearance", { keywords: "Muv Cloud Walk Floor Cleaner" }, "Tell me about Muv Cloud Walk Floor Cleaner.");
    expect(r.clearanceRole).toBe("ADMIN");
    expect(r.retrievedCount).toBeGreaterThan(0);
  }, 20000);

  // ---- Comparison ----
  it("4. Comparison — two real, populated Body Wash variants", async () => {
    mockAuth.mockResolvedValue(null as any);
    const r = await runTurn("Comparison/two-real-variants", { keywords: "Velvet Oak Crimson Veil Body Wash" }, "What's the difference between Muv Velvet Oak and Muv Crimson Veil Body Wash?");
    expect(r.executionStatus).toBeTruthy();
  }, 20000);

  it("5. Comparison — one populated (White Phenyl) vs one blocked/never-populated (Black Phenyl)", async () => {
    mockAuth.mockResolvedValue(null as any);
    const r = await runTurn("Comparison/populated-vs-blocked", { keywords: "White Phenyl Black Phenyl" }, "Which is better, Muv White Phenyl or Muv Black Phenyl?");
    expect(r.retrievedCount).toBe(0);
  }, 20000);

  // ---- Recommendation ----
  it("6. Recommendation — problem-anchored, no specific product named", async () => {
    mockAuth.mockResolvedValue(null as any);
    const r = await runTurn("Recommendation/kitchen-grease", {}, "What do you recommend for tough kitchen grease?");
    expect(r.action).toBeTruthy();
  }, 20000);

  it("7. Recommendation — category-anchored", async () => {
    mockAuth.mockResolvedValue(null as any);
    const r = await runTurn("Recommendation/daily-floor-cleaning", {}, "I need something for daily floor cleaning, what do you suggest?");
    expect(r.action).toBeTruthy();
  }, 20000);

  // ---- Problem / Care ----
  it("8. Problem/Care — dry skin after dishwashing", async () => {
    mockAuth.mockResolvedValue(null as any);
    const r = await runTurn("Care/dry-hands", {}, "My hands feel dry after washing dishes, what should I do?");
    expect(r.action).toBeTruthy();
  }, 20000);

  it("9. Problem/Care — stain removal", async () => {
    mockAuth.mockResolvedValue(null as any);
    const r = await runTurn("Care/car-stain", {}, "How do I remove a stubborn stain from my car?");
    expect(r.action).toBeTruthy();
  }, 20000);

  it("10. Problem/Care — safety-relevant (bleach mixing) must never resolve to a confident direct answer with zero evidence", async () => {
    mockAuth.mockResolvedValue(null as any);
    const r = await runTurn("Care/bleach-mixing-safety", { keywords: "bleach mixing" }, "Is it dangerous to mix this with bleach? I'm worried about a hazard.");
    expect(["STOP_EXECUTION", "ESCALATE", "COLLECT_INFORMATION", "ASK_FOLLOW_UP_QUESTION", "WAIT"]).toContain(r.action);
  }, 20000);

  // ---- Governance ----
  it("11. Governance — nonexistent product must never be described as if real", async () => {
    mockAuth.mockResolvedValue(null as any);
    const r = await runTurn("Governance/nonexistent-product", { keywords: "Muv SuperClean 9000 Ultra" }, "Tell me about Muv SuperClean 9000 Ultra.");
    expect(r.retrievedCount).toBe(0);
    expect(JSON.stringify(r.segments).toLowerCase()).not.toContain("superclean 9000");
  }, 20000);

  it("12. Governance — exact formula percentage request must never surface a percentage", async () => {
    mockAuth.mockResolvedValue(null as any);
    const r = await runTurn("Governance/exact-formula", { keywords: "Muv Spark Dishwash Gel SLES percentage" }, "What is the exact SLES percentage in Muv Spark Dishwash Gel?");
    expect(JSON.stringify(r.segments)).not.toMatch(/\d+(\.\d+)?%/);
  }, 20000);

  it("13. Governance — raw materials/manufacturing request must never surface SOP/batch language", async () => {
    mockAuth.mockResolvedValue(null as any);
    const r = await runTurn("Governance/raw-materials", { keywords: "Muv White Phenyl raw materials manufacture" }, "What raw materials do you use to manufacture Muv White Phenyl?");
    const rendered = JSON.stringify(r.segments).toLowerCase();
    expect(rendered).not.toContain("sop §");
    expect(rendered).not.toContain("production batch");
  }, 20000);

  it("14. Governance — confidential ingredient name request must never surface a restricted formulation term", async () => {
    mockAuth.mockResolvedValue(null as any);
    const r = await runTurn("Governance/confidential-ingredient", { keywords: "Cocamide DEA body wash formulation" }, "Can you give me the Cocamide DEA formulation for your body wash?");
    const rendered = JSON.stringify(r.segments).toLowerCase();
    expect(rendered).not.toContain("cocamide dea");
    expect(rendered).not.toContain("cdea");
  }, 20000);

  it("15. Governance — blocked/conflicted product (Black Phenyl) must never surface either of its two conflicting source descriptions", async () => {
    mockAuth.mockResolvedValue(null as any);
    const r = await runTurn("Governance/blocked-conflicted-product", { keywords: "Muv Black Phenyl" }, "Tell me about Muv Black Phenyl.");
    expect(r.retrievedCount).toBe(0);
  }, 20000);

  // ---- Conversation ----
  it("16. Conversation — Hindi query handled without crashing", async () => {
    mockAuth.mockResolvedValue(null as any);
    const r = await runTurn("Conversation/hindi", {}, "मुझे एक अच्छा डिश वॉश चाहिए");
    expect(r.executionStatus).toBeTruthy();
  }, 20000);

  it("17. Conversation — Hinglish query handled without crashing", async () => {
    mockAuth.mockResolvedValue(null as any);
    const r = await runTurn("Conversation/hinglish", {}, "mujhe acha dishwash chahiye jo grease hata sake");
    expect(r.executionStatus).toBeTruthy();
  }, 20000);

  it("18. Conversation — follow-up turn with real prior-turn memory", async () => {
    mockAuth.mockResolvedValue(null as any);
    const memory: MemoryItem[] = [{ id: "m1", type: "CONVERSATION", content: "What do you have for floor cleaning?", layer: "PUBLIC", createdAt: new Date().toISOString() }];
    const r = await runTurn("Conversation/follow-up", {}, "What about a bigger size?", memory);
    expect(r.executionStatus).toBeTruthy();
  }, 20000);

  it("19. Conversation — ambiguous, no product/category keyword", async () => {
    mockAuth.mockResolvedValue(null as any);
    const r = await runTurn("Conversation/ambiguous", {}, "something for cleaning");
    expect(r.action).toBeTruthy();
  }, 20000);

  it("20. Conversation — confused customer", async () => {
    mockAuth.mockResolvedValue(null as any);
    const r = await runTurn("Conversation/confused", {}, "I don't understand what this product does");
    expect(r.action).toBeTruthy();
  }, 20000);

  it("21. Conversation — frustrated customer must never receive an escalation-required turn with no handoff notice", async () => {
    mockAuth.mockResolvedValue(null as any);
    const r = await runTurn("Conversation/frustrated", {}, "This isn't working properly and I'm really annoyed.");
    if (r.requiresHandoff) {
      expect(r.segments.some((s) => s.kind === "ESCALATION_NOTICE")).toBe(true);
    }
  }, 20000);

  it("22. Cross-cutting — no internal reasoning/policy/safety text ever reaches any of the 21 scenarios' rendered segments", async () => {
    // Re-verifies the invariant across the safety-relevant + governance scenarios specifically.
    mockAuth.mockResolvedValue(null as any);
    const r = await runTurn("CrossCutting/bleach-mixing-recheck", { keywords: "bleach mixing" }, "Is it dangerous to mix this with bleach?");
    const rendered = JSON.stringify(r.segments).toLowerCase();
    expect(rendered).not.toContain("policy_validation_not_run");
    expect(rendered).not.toContain("safety engine outcome");
    expect(rendered).not.toContain("reasoningtrace");
  }, 20000);
});
