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
import type { IntelligenceRequest } from "@/lib/intelligence/types";

/**
 * Block 2B, Stage 4 — Four-layer governed runtime integration verification.
 *
 * Exercises the REAL, unmodified, already-frozen runtime chain — Module 6
 * (`buildIntelligence`) → Module 7 (`executePipeline`) → Module 8
 * (`buildExperienceResponse` + `adaptForWebsite`) — exactly as
 * `lib/experience/experience-orchestrator.ts`'s legacy path calls them,
 * minus only the session-management wrapper (`getSession`/`touchSession`,
 * separate bookkeeping infrastructure, not part of the intelligence
 * pipeline itself). `auth()` naturally resolves to `null` outside a real
 * request scope (verified empirically), so every fetcher here runs at
 * real ANONYMOUS clearance — the same clearance a real customer gets —
 * with zero mocking.
 *
 * A structural fact confirmed by reading lib/intelligence/types.ts
 * directly, not assumed: `IntelligenceRequest.retrieval` never exposes a
 * `versionSelector` field, so `buildIntelligence()` can only ever request
 * `mode: "published"` content — it has no way to ask for DRAFT/REVIEW
 * content even for a caller with elevated clearance. Since every row this
 * task populated is intentionally DRAFT-only (never auto-published), this
 * means NONE of today's populated content is retrievable through the
 * real orchestrated pipeline yet, for ANY caller — by design, not a gap.
 * That is exactly what tests 1–3 below verify actually happens.
 */

async function runTurn(retrieval: IntelligenceRequest["retrieval"], customerMessage: string) {
  const { decisionPackage, clearanceLayer } = await buildIntelligence({ retrieval, customerMessage }, false);
  const executionPackage = executePipeline({ decisionPackage, clearanceLayer: clearanceLayer as "PUBLIC" | "INTERNAL" | "CONFIDENTIAL" });
  const experienceResponse = buildExperienceResponse("test-session", executionPackage);
  const view = adaptForWebsite(experienceResponse);
  return { decisionPackage, executionPackage, experienceResponse, view };
}

describe("Block 2B, Stage 4 — Governed Runtime Integration (real, unmocked pipeline)", () => {
  it("1. today's populated (DRAFT-only, unpublished) content is correctly invisible to the real orchestrated pipeline", async () => {
    const { decisionPackage } = await runTurn({ keywords: "Muv Cool Water Liquid Detergent" }, "What is the price of Muv Cool Water Liquid Detergent?");
    expect(decisionPackage.context.retrievedKnowledge).toHaveLength(0);
    expect(decisionPackage.productReferences).toHaveLength(0);
  }, 20000);

  it("2. a query naming a real, populated Care workflow slug still finds nothing published — governance gate holds even for a direct, specific lookup", async () => {
    const { decisionPackage } = await runTurn({ slug: "care-bleach-mixing-safety-escalation" }, "Can I mix bleach with another cleaner?");
    expect(decisionPackage.context.retrievedKnowledge).toHaveLength(0);
  }, 20000);

  it("3. with zero retrieved knowledge, the pipeline still completes end-to-end without crashing and returns a valid, structurally-safe view", async () => {
    const { executionPackage, view } = await runTurn({ keywords: "Cool Water" }, "What is the price of Cool Water Liquid Detergent?");
    expect(["EXECUTED", "BLOCKED", "ESCALATED", "DEFERRED", "NEEDS_MORE_INFORMATION", "NEEDS_HUMAN_REVIEW"]).toContain(executionPackage.executionStatus);
    expect(view.sessionId).toBe("test-session");
    expect(Array.isArray(view.segments)).toBe(true);
  }, 20000);

  it("4. a safety-relevant customer message is correctly classified as SAFETY priority from the message text alone (no retrieval needed)", async () => {
    const { decisionPackage } = await runTurn({ keywords: "bleach mixing" }, "Is it dangerous to mix this with bleach? I'm worried about a hazard.");
    expect(decisionPackage.priority.category).toBe("SAFETY");
    expect(decisionPackage.priority.level).toBe("URGENT");
  }, 20000);

  it("5. safety-classified turns never produce a customer-facing ANSWER_CUSTOMER/RECOMMEND_* action with zero evidence — a conservative action is chosen instead", async () => {
    const { executionPackage } = await runTurn({ keywords: "bleach mixing" }, "Is it dangerous to mix this with bleach? I'm worried about a hazard.");
    expect(["STOP_EXECUTION", "ESCALATE", "COLLECT_INFORMATION", "ASK_FOLLOW_UP_QUESTION", "WAIT"]).toContain(executionPackage.action.action);
  }, 20000);

  it("6. no internal reasoning, safety notes, or policy violation text ever reaches the customer-facing view", async () => {
    const { view } = await runTurn({ keywords: "bleach mixing" }, "Is it dangerous to mix this with bleach? I'm worried about a hazard.");
    const rendered = JSON.stringify(view);
    expect(rendered.toLowerCase()).not.toContain("policy_validation_not_run");
    expect(rendered.toLowerCase()).not.toContain("safety engine outcome");
  }, 20000);

  it("7. no Ingredients/formula content ever reaches the customer-facing view for any turn", async () => {
    const { view } = await runTurn({ keywords: "Cool Water" }, "What is Muv Cool Water Liquid Detergent made of?");
    expect(JSON.stringify(view).toLowerCase()).not.toContain("ingredient");
  }, 20000);

  it("8. reasoningTrace is never populated for this pipeline's caller (includeReasoningTrace=false), matching the 'never expose internal reasoning' rule", async () => {
    const { decisionPackage } = await runTurn({ keywords: "Cool Water" }, "What is the price of Cool Water?");
    expect(decisionPackage.reasoningTrace).toBeNull();
  }, 20000);

  it("9. the external AI provider remains disabled — no provider env var is configured", () => {
    expect(process.env.GATEWAY_LLM_PROVIDER ?? "").toBe("");
    expect(process.env.LLM_PROVIDER ?? "").toBe("");
  });

  it("10. multi-turn context — two sequential calls for the same query produce a stable, deterministic decision (no randomness)", async () => {
    const turn1 = await runTurn({ keywords: "Cool Water" }, "What is the price of Cool Water?");
    const turn2 = await runTurn({ keywords: "Cool Water" }, "What is the price of Cool Water?");
    expect(turn1.decisionPackage.decision.recommendedNextStep).toBe(turn2.decisionPackage.decision.recommendedNextStep);
    expect(turn1.executionPackage.action.action).toBe(turn2.executionPackage.action.action);
  }, 20000);
});
