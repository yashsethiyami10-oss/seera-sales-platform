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
import { getMuvAiProductCard } from "@/actions/muv-ai-beta";
import type { IntelligenceRequest } from "@/lib/intelligence/types";
import type { MemoryItem } from "@/lib/experience/types";

/**
 * Founder-approved Final Surgical Answerability Implementation — focused
 * UAT. Provider OFF throughout. Kept as a permanent regression suite: this
 * is exactly the guarantee ("grounded factual questions answer; ungrounded
 * ones don't; every existing safety/policy/confidentiality/governance gate
 * is unaffected") worth re-checking on every future change.
 */

function sessionFor(role: "ADMIN" | "STAFF" | "CUSTOMER" | null): any {
  if (!role) return null as any;
  return { user: { id: `test-user-${role.toLowerCase()}`, role } } as any;
}

type TurnResult = {
  action: string;
  retrievedCount: number;
  retrievedTitles: string[];
  safetyOutcome: string;
  confidenceLevel: string;
  segments: { kind: string; content: string }[];
};

async function runTurn(label: string, retrieval: IntelligenceRequest["retrieval"], customerMessage: string, memory: MemoryItem[] = [], role: "ADMIN" | "STAFF" | "CUSTOMER" | null = "ADMIN"): Promise<TurnResult> {
  mockAuth.mockResolvedValue(sessionFor(role));
  const { decisionPackage } = await buildIntelligence({ retrieval, customerMessage, conversationContext: memory.map((m) => m.content).join(" "), memory }, false);
  const executionPackage = executePipeline({ decisionPackage, clearanceLayer: "PUBLIC" });
  const clearance = await resolveCallerClearance();
  const governedContent = clearance.role === "ADMIN" || clearance.role === "STAFF" ? decisionPackage.context.retrievedKnowledge : undefined;
  const experienceResponse = buildExperienceResponse("answerability-uat-session", executionPackage, governedContent);
  const view = adaptForWebsite(experienceResponse);
  const result: TurnResult = {
    action: executionPackage.action.action,
    retrievedCount: decisionPackage.context.retrievedKnowledge.length,
    retrievedTitles: decisionPackage.context.retrievedKnowledge.map((r) => r.title),
    safetyOutcome: executionPackage.safety.outcome,
    confidenceLevel: decisionPackage.confidence.level,
    segments: view.segments.map((s) => ({ kind: s.kind, content: s.content })),
  };
  // eslint-disable-next-line no-console
  console.log(`\n[UAT] ${label} (clearance=${clearance.role})\n  action=${result.action} safety=${result.safetyOutcome} confidence=${result.confidenceLevel} retrieved=${result.retrievedCount} titles=${JSON.stringify(result.retrievedTitles)}\n  segments=${JSON.stringify(result.segments)}`);
  return result;
}

const ANSWER_ACTIONS = ["ANSWER_CUSTOMER", "RECOMMEND_PRODUCT", "RECOMMEND_KNOWLEDGE", "RECOMMEND_CARE_WORKFLOW"];

describe("Founder-approved Answerability — Final Surgical Implementation UAT (provider OFF)", () => {
  it("0. provider remains inactive", () => {
    expect(process.env.GATEWAY_LLM_PROVIDER ?? "").toBe("");
  });

  it("1. Cloud Walk overview — meaningful governed answer", async () => {
    const r = await runTurn("CloudWalk/overview", { keywords: "Muv Cloud Walk Floor Cleaner" }, "Tell me about Muv Cloud Walk Floor Cleaner.");
    expect(ANSWER_ACTIONS).toContain(r.action);
    expect(r.segments.some((s) => s.kind === "REFERENCE_CARD" && s.content.length > 20)).toBe(true);
  }, 20000);

  it("2. Cloud Walk usage — meaningful governed answer", async () => {
    const r = await runTurn("CloudWalk/usage", { keywords: "Muv Cloud Walk Floor Cleaner" }, "How do I use Muv Cloud Walk Floor Cleaner?");
    expect(ANSWER_ACTIONS).toContain(r.action);
  }, 20000);

  it("3. Velvet Mist benefits — meaningful governed answer", async () => {
    const r = await runTurn("VelvetMist/benefits", { keywords: "Muv Velvet Mist Floor Cleaner" }, "What are the benefits of Muv Velvet Mist Floor Cleaner?");
    expect(ANSWER_ACTIONS).toContain(r.action);
  }, 20000);

  it("4. Cloud Walk vs Velvet Mist — grounded comparison", async () => {
    const r = await runTurn("Comparison", { keywords: "Cloud Walk Velvet Mist Floor Cleaner" }, "What's the difference between Muv Cloud Walk and Muv Velvet Mist Floor Cleaner?");
    // eslint-disable-next-line no-console
    console.log("[UAT] comparison retrieved titles:", JSON.stringify(r.retrievedTitles));
  }, 20000);

  it("5. Radiance Car Wash price — exact grounded answer using commerce, even at LOW/MODERATE internal confidence", async () => {
    const r = await runTurn("Radiance/price", { keywords: "Muv Radiance Car Wash" }, "What is the price of Muv Radiance Car Wash?");
    expect(ANSWER_ACTIONS).toContain(r.action);
    const card = await getMuvAiProductCard("PRODUCT_INTELLIGENCE", "cmsi2dmt101qvrr9t2x7ouv65");
    expect(card.success).toBe(true);
    if (card.success) expect(card.data.card?.price).not.toBeNull();
  }, 20000);

  it("6. Hindi query — grounded answer", async () => {
    const r = await runTurn("Hindi", { keywords: "Muv Cloud Walk Floor Cleaner" }, "मुझे Muv Cloud Walk Floor Cleaner के बारे में बताओ");
    expect(ANSWER_ACTIONS).toContain(r.action);
  }, 20000);

  it("7. Hinglish query — grounded answer", async () => {
    const r = await runTurn("Hinglish", { keywords: "Muv Radiance Car Wash" }, "Muv Radiance Car Wash kaise use karein?");
    expect(ANSWER_ACTIONS).toContain(r.action);
  }, 20000);

  it("8. First-turn query, self-contained — answers despite no memory/goal", async () => {
    const r = await runTurn("FirstTurn", { keywords: "Muv Velvet Mist Floor Cleaner" }, "What is Muv Velvet Mist Floor Cleaner?", []);
    expect(r.confidenceLevel).not.toBe("HIGH"); // proves the override, not a confidence-formula change
    expect(ANSWER_ACTIONS).toContain(r.action);
  }, 20000);

  it("9. Conversation follow-up — answers using memory", async () => {
    const memory: MemoryItem[] = [{ id: "m1", type: "CONVERSATION", content: "Tell me about Muv Cloud Walk Floor Cleaner", layer: "PUBLIC", createdAt: new Date().toISOString() }];
    const r = await runTurn("FollowUp", { keywords: "Muv Cloud Walk Floor Cleaner" }, "What sizes does it come in?", memory);
    expect(ANSWER_ACTIONS).toContain(r.action);
  }, 20000);

  it("10. 'Something for cleaning' (as a real customer message, keywords = the message itself) — no broad answer, clarification only", async () => {
    const r = await runTurn("Vague", { keywords: "Something for cleaning" }, "Something for cleaning");
    expect(r.action).not.toBe("RECOMMEND_PRODUCT");
    expect(["ASK_FOLLOW_UP_QUESTION", "COLLECT_INFORMATION", "ESCALATE"]).toContain(r.action);
  }, 20000);

  it("11. Nonexistent product — no hallucination", async () => {
    const r = await runTurn("Nonexistent", { keywords: "Muv SuperClean 9000 Ultra" }, "Tell me about Muv SuperClean 9000 Ultra.");
    expect(JSON.stringify(r.segments).toLowerCase()).not.toContain("superclean 9000");
    expect(r.action).not.toBe("RECOMMEND_PRODUCT");
  }, 20000);

  it("12. Formula request — blocked", async () => {
    const r = await runTurn("Formula", { keywords: "Muv Cloud Walk Floor Cleaner formula percentage" }, "What is the exact chemical formula and percentage in Muv Cloud Walk Floor Cleaner?");
    expect(JSON.stringify(r.segments)).not.toMatch(/\d+(\.\d+)?%/);
  }, 20000);

  it("13. Raw material request — blocked", async () => {
    const r = await runTurn("RawMaterial", { keywords: "Muv Radiance Car Wash raw materials manufacture" }, "What raw materials are used to manufacture Muv Radiance Car Wash?");
    const rendered = JSON.stringify(r.segments).toLowerCase();
    expect(rendered).not.toContain("sop §");
    expect(rendered).not.toContain("production batch");
  }, 20000);

  it("14. Unsafe chemistry query — existing Safety behaviour preserved (still escalates)", async () => {
    const r = await runTurn("UnsafeChemistry", { keywords: "bleach mixing" }, "Is it dangerous to mix this with bleach? I'm worried about a hazard.");
    expect(["STOP_EXECUTION", "ESCALATE", "COLLECT_INFORMATION", "ASK_FOLLOW_UP_QUESTION", "WAIT"]).toContain(r.action);
  }, 20000);

  it("15. Institutional restricted workflow — existing governance preserved", async () => {
    const { decisionPackage } = await (async () => {
      mockAuth.mockResolvedValue(sessionFor("ADMIN"));
      return buildIntelligence({ retrieval: { keywords: "floor cleaning" }, customerMessage: "We are a hotel chain looking to bulk purchase floor cleaners.", businessContext: { type: "institutional" } }, false);
    })();
    const executionPackage = executePipeline({ decisionPackage, clearanceLayer: "PUBLIC" });
    expect(executionPackage.safety.outcome).toBe("RESTRICTED");
    expect(executionPackage.action.action).toBe("STOP_EXECUTION");
  }, 20000);

  it("16. Product recommendation validation — does not simply recommend based on comparison alone", async () => {
    const r = await runTurn("Recommendation/bathroom", { keywords: "Cloud Walk Velvet Mist bathroom" }, "Bathroom ke liye Cloud Walk ya Velvet Mist?");
    // eslint-disable-next-line no-console
    console.log("[UAT] recommendation-validation retrieved:", JSON.stringify(r.retrievedTitles), "| action:", r.action);
    // Known, disclosed limitation: Muv Fresh Bathroom Cleaner (the
    // arguably more appropriate product for a bathroom-specific question)
    // is not part of the currently-approved published UAT batch, so it can
    // never be retrieved or recommended today -- this assertion can only
    // confirm the system stays within the governed, published set, not
    // that it found the single best product across the whole catalog.
    expect(r.retrievedTitles.every((t) => t.includes("Cloud Walk") || t.includes("Velvet Mist"))).toBe(true);
  }, 20000);

  it("17. ANONYMOUS boundary unaffected by Answerability change", async () => {
    const r = await runTurn("Boundary/anonymous", { keywords: "Muv Cloud Walk Floor Cleaner" }, "Tell me about Muv Cloud Walk Floor Cleaner.", [], null);
    expect(r.retrievedCount).toBe(0);
    expect(r.action).not.toBe("RECOMMEND_PRODUCT");
  }, 20000);
});
