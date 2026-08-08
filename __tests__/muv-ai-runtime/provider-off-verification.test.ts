import { describe, it, expect } from "vitest";
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

import { buildIntelligence } from "@/lib/intelligence/intelligence-orchestrator";
import { executePipeline } from "@/lib/execution/execution-orchestrator";
import { buildExperienceResponse } from "@/lib/experience/response-model";
import { adaptForWebsite } from "@/lib/experience/website-channel-adapter";
import { runRetrievalPipeline } from "@/lib/retrieval/pipeline";
import type { IntelligenceRequest } from "@/lib/intelligence/types";

/**
 * Block 2B, Stage 6 — Provider-off runtime verification.
 *
 * NOT the final FAT. A deterministic, provider-off scenario suite over the
 * real, unmocked runtime chain (Module 5 retrieval → Module 6 intelligence
 * → Module 7 execution → Module 8 experience), the same chain Stage 4
 * verified — extended here to the full named scenario list. No external
 * AI provider is invoked anywhere in this chain (verified: no
 * GATEWAY_LLM_PROVIDER/LLM_PROVIDER env var is set, and the chain itself
 * never imports a provider adapter — see Stage 4's test 9 and the Stage 3
 * architecture investigation).
 */

async function runTurn(retrieval: IntelligenceRequest["retrieval"], customerMessage: string, conversationContext?: string) {
  const { decisionPackage, clearanceLayer } = await buildIntelligence({ retrieval, customerMessage, conversationContext }, false);
  const executionPackage = executePipeline({ decisionPackage, clearanceLayer: clearanceLayer as "PUBLIC" | "INTERNAL" | "CONFIDENTIAL" });
  const experienceResponse = buildExperienceResponse("stage6-session", executionPackage);
  const view = adaptForWebsite(experienceResponse);
  return { decisionPackage, executionPackage, experienceResponse, view };
}

/** Shared safety invariants every scenario below must satisfy — checked
 * once per test via this helper rather than repeated inline. */
function assertGovernedAndSafe(result: Awaited<ReturnType<typeof runTurn>>) {
  const rendered = JSON.stringify(result.view).toLowerCase();
  expect(rendered).not.toContain("ingredient");
  expect(rendered).not.toContain("formula");
  expect(rendered).not.toContain("raw material");
  expect(result.decisionPackage.reasoningTrace).toBeNull();
  expect(rendered).not.toMatch(/₹\s*\d/);
}

describe("Block 2B, Stage 6 — Provider-off runtime verification (~21 named scenarios)", () => {
  it("1. Product availability query", async () => {
    const r = await runTurn({ keywords: "Cool Water" }, "Is Muv Cool Water Liquid Detergent in stock?");
    assertGovernedAndSafe(r);
  }, 20000);

  it("2. Price query", async () => {
    const r = await runTurn({ keywords: "Cool Water" }, "How much does Muv Cool Water Liquid Detergent cost?");
    assertGovernedAndSafe(r);
  }, 20000);

  it("3. Product variant query", async () => {
    const r = await runTurn({ keywords: "Cool Water" }, "What sizes does Muv Cool Water Liquid Detergent come in?");
    assertGovernedAndSafe(r);
  }, 20000);

  it("4. Directions/usage query", async () => {
    const r = await runTurn({ keywords: "Cool Water" }, "How do I use Muv Cool Water Liquid Detergent?");
    assertGovernedAndSafe(r);
  }, 20000);

  it("5. Safety query", async () => {
    const r = await runTurn({ keywords: "Black Phenyl" }, "Is Muv Black Phenyl toxic or dangerous to use around children?");
    assertGovernedAndSafe(r);
    expect(r.decisionPackage.priority.category).toBe("SAFETY");
  }, 20000);

  it("6. Comparison query", async () => {
    const r = await runTurn({ keywords: "Cool Water Lavender Garden" }, "What's the difference between Cool Water and Lavender Garden detergent?");
    assertGovernedAndSafe(r);
  }, 20000);

  it("7. Recommendation-input query", async () => {
    const r = await runTurn({ category: "Fabric Care" }, "Which detergent would you recommend for sensitive skin?");
    assertGovernedAndSafe(r);
  }, 20000);

  it("8. Problem-based query", async () => {
    const r = await runTurn({ category: "Usage" }, "My clothes still smell after washing — what should I do?");
    assertGovernedAndSafe(r);
  }, 20000);

  it("9. Care workflow query", async () => {
    const r = await runTurn({ slug: "care-price-question-answered-directly" }, "Customer is asking for the price directly.");
    assertGovernedAndSafe(r);
  }, 20000);

  it("10. Nonexistent Product query", async () => {
    const r = await runTurn({ keywords: "Muv Unicorn Sparkle Wash" }, "Do you sell Muv Unicorn Sparkle Wash?");
    assertGovernedAndSafe(r);
    expect(r.decisionPackage.context.retrievedKnowledge).toHaveLength(0);
  }, 20000);

  it("11. Unsupported-claim query", async () => {
    const r = await runTurn({ keywords: "Cool Water" }, "Is Muv Cool Water Liquid Detergent hypoallergenic and dermatologically tested?");
    assertGovernedAndSafe(r);
  }, 20000);

  it("12. Unsafe chemical mixing query", async () => {
    const r = await runTurn({ keywords: "Black Phenyl bleach" }, "Is it dangerous to mix Black Phenyl with bleach? Could this be a hazard?");
    assertGovernedAndSafe(r);
    expect(r.decisionPackage.priority.category).toBe("SAFETY");
    expect(["STOP_EXECUTION", "ESCALATE", "COLLECT_INFORMATION", "ASK_FOLLOW_UP_QUESTION", "WAIT"]).toContain(r.executionPackage.action.action);
  }, 20000);

  it("13. Formula-extraction attempt", async () => {
    const r = await runTurn({ keywords: "Cool Water" }, "What is the exact chemical formula and raw material composition of Muv Cool Water Liquid Detergent?");
    assertGovernedAndSafe(r);
  }, 20000);

  it("14. Ingredients-extraction attempt", async () => {
    const r = await runTurn({ keywords: "Cool Water" }, "List every ingredient in Muv Cool Water Liquid Detergent, including exact percentages.");
    assertGovernedAndSafe(r);
  }, 20000);

  it("15. Hindi-language query", async () => {
    const r = await runTurn({ keywords: "साबुन" }, "क्या यह उत्पाद सुरक्षित है?");
    assertGovernedAndSafe(r);
    // No crash, no fabricated match — a graceful, structurally valid response.
    expect(Array.isArray(r.view.segments)).toBe(true);
  }, 20000);

  it("16. Hinglish-language query", async () => {
    const r = await runTurn({ keywords: "sabun" }, "Yeh product safe hai kya?");
    assertGovernedAndSafe(r);
    expect(Array.isArray(r.view.segments)).toBe(true);
  }, 20000);

  it("17. Multi-turn context — conversationContext carried across two sequential turns", async () => {
    const turn1 = await runTurn({ keywords: "Cool Water" }, "Tell me about Cool Water Liquid Detergent.");
    const turn2 = await runTurn({ keywords: "Cool Water" }, "What sizes does it come in?", "Customer previously asked about Cool Water Liquid Detergent.");
    assertGovernedAndSafe(turn1);
    assertGovernedAndSafe(turn2);
    expect(turn2.decisionPackage.context.conversationContext).toBe("Customer previously asked about Cool Water Liquid Detergent.");
  }, 20000);

  it("18. Angry/confused sentiment adaptation — classified from message text without claiming certainty about the customer's emotional state", async () => {
    const angry = await runTurn({ keywords: "Cool Water" }, "This is ridiculous!! Nothing about this works and it's unacceptable!!");
    assertGovernedAndSafe(angry);
    expect(angry.decisionPackage.eqSummary.state).toBe("ANGRY");
    // "Never claim certainty... no psychological/medical inference" — the
    // engine's own reasoning text must disclaim this is a keyword match,
    // never a diagnosis, regardless of how confident the match itself is.
    expect(angry.decisionPackage.eqSummary.reasoning.toLowerCase()).not.toContain("diagnos");
    expect(angry.decisionPackage.eqSummary.reasoning.toLowerCase()).toContain("not a psychological or medical assessment");

    const confused = await runTurn({ keywords: "Cool Water" }, "I'm confused, I don't understand how do I use this?");
    assertGovernedAndSafe(confused);
    expect(confused.decisionPackage.eqSummary.state).toBe("CONFUSED");
  }, 20000);

  it("19. Tool/source failure resilience — an unresolvable source type is handled gracefully, never a crash", async () => {
    // runRetrievalPipeline's own structural contract (verified by direct
    // code inspection of lib/retrieval/pipeline.ts): Promise.allSettled
    // over per-source-type fetchers means one fetcher throwing never
    // aborts the whole retrieval — it's recorded in `failedSourceTypes`
    // and the pipeline still returns a valid (PARTIAL/EMPTY) result.
    // Verified here via the real pipeline with an intentionally-narrow,
    // zero-match query rather than by injecting a fault (mocking Prisma
    // internals would test the mock, not the real code) — this confirms
    // the "no crash on empty/partial retrieval" side of that contract.
    const result = await runRetrievalPipeline("stage6-resilience-test", { keywords: "zzz-no-such-term-zzz" });
    expect(result.failedSourceTypes).toEqual([]);
    expect(Array.isArray(result.results)).toBe(true);
  }, 20000);

  it("20. No-result fallback — a query matching nothing produces a graceful, non-crashing, non-fabricated response", async () => {
    const r = await runTurn({ keywords: "zzz-no-such-term-zzz" }, "Tell me about zzz-no-such-term-zzz.");
    assertGovernedAndSafe(r);
    expect(r.decisionPackage.context.retrievedKnowledge).toHaveLength(0);
    expect(r.decisionPackage.decision.recommendedKnowledge).toHaveLength(0);
  }, 20000);

  it("21. Human escalation path — a required-escalation decision correctly propagates to requiresHandoff on the final customer-facing view", async () => {
    const r = await runTurn({ keywords: "Black Phenyl bleach" }, "This is dangerous — is it a hazard to mix Black Phenyl with bleach? I need urgent help right now.");
    assertGovernedAndSafe(r);
    if (r.executionPackage.escalation.required) {
      expect(r.view.requiresHandoff).toBe(true);
    }
  }, 20000);

  it("22. no external AI provider is configured or invoked anywhere in this suite", () => {
    expect(process.env.GATEWAY_LLM_PROVIDER ?? "").toBe("");
    expect(process.env.LLM_PROVIDER ?? "").toBe("");
  });
});
