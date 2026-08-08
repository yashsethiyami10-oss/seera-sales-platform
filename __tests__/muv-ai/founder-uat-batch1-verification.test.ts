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
 * Founder Publishing Review — Step 5 verification for the first controlled
 * UAT batch (Muv Cloud Walk Floor Cleaner, Muv Velvet Mist Floor Cleaner,
 * Muv Radiance Car Wash), now PUBLISHED (layer still INTERNAL) per the
 * Founder's explicit approval. Kept as a PERMANENT regression test (unlike
 * the one-shot activation script, which was deleted) — this is exactly the
 * kind of governance-boundary guarantee worth re-checking on every future
 * change: real content now reaches a verified STAFF/ADMIN turn, while an
 * ordinary customer/anonymous turn remains completely unaffected, proven
 * by running the identical query at both clearances side by side.
 */

function sessionFor(role: "ADMIN" | "STAFF" | "CUSTOMER" | null): any {
  if (!role) return null as any;
  return { user: { id: `test-user-${role.toLowerCase()}`, role } } as any;
}

const PI_IDS = {
  cloudWalk: "cmsi2dha001pcrr9tywivszzt",
  velvetMist: "cmsi2dodt01rarr9tdxutww8m",
  radianceCarWash: "cmsi2dmt101qvrr9t2x7ouv65",
};

type TurnResult = {
  label: string;
  clearanceRole: string;
  action: string;
  retrievedCount: number;
  retrievedTitles: string[];
  segments: { kind: string; content: string }[];
};

async function runTurn(label: string, retrieval: IntelligenceRequest["retrieval"], customerMessage: string, memory: MemoryItem[] = []): Promise<TurnResult> {
  const { decisionPackage } = await buildIntelligence({ retrieval, customerMessage, conversationContext: memory.map((m) => m.content).join(" "), memory }, false);
  const executionPackage = executePipeline({ decisionPackage, clearanceLayer: "PUBLIC" });
  const clearance = await resolveCallerClearance();
  const governedContent = clearance.role === "ADMIN" || clearance.role === "STAFF" ? decisionPackage.context.retrievedKnowledge : undefined;
  const experienceResponse = buildExperienceResponse("uat-batch1-session", executionPackage, governedContent);
  const view = adaptForWebsite(experienceResponse);
  const result: TurnResult = {
    label,
    clearanceRole: clearance.role,
    action: executionPackage.action.action,
    retrievedCount: decisionPackage.context.retrievedKnowledge.length,
    retrievedTitles: decisionPackage.context.retrievedKnowledge.map((r) => r.title),
    segments: view.segments.map((s) => ({ kind: s.kind, content: s.content })),
  };
  // eslint-disable-next-line no-console
  console.log(`\n[STEP5] ${label} (clearance=${clearance.role})\n  action=${result.action} retrieved=${result.retrievedCount} titles=${JSON.stringify(result.retrievedTitles)}\n  segments=${JSON.stringify(result.segments)}`);
  return result;
}

describe("Founder Publishing Review — Step 5: first UAT batch, provider-off governed verification", () => {
  it("0. provider remains inactive", () => {
    expect(process.env.GATEWAY_LLM_PROVIDER ?? "").toBe("");
  });

  it("1. Product description (ADMIN) — Cloud Walk Floor Cleaner now returns real retrieved content, excluding unrelated Radiance Car Wash", async () => {
    mockAuth.mockResolvedValue(sessionFor("ADMIN"));
    const r = await runTurn("Product-description/cloud-walk", { keywords: "Muv Cloud Walk Floor Cleaner" }, "Tell me about Muv Cloud Walk Floor Cleaner.");
    expect(r.retrievedCount).toBeGreaterThan(0);
    expect(r.retrievedTitles.some((t) => t.includes("Cloud Walk"))).toBe(true);
    expect(r.retrievedTitles.some((t) => t.includes("Radiance") || t.includes("car-wash") || t.includes("Car Wash"))).toBe(false);
  }, 20000);

  it("2. Usage/directions (ADMIN) — Cloud Walk usage instructions", async () => {
    mockAuth.mockResolvedValue(sessionFor("ADMIN"));
    const r = await runTurn("Usage/cloud-walk", { keywords: "Muv Cloud Walk Floor Cleaner" }, "How do I use Muv Cloud Walk Floor Cleaner?");
    expect(r.retrievedCount).toBeGreaterThan(0);
  }, 20000);

  it("3. Variants/price/availability via governed commerce tool — Cloud Walk", async () => {
    const card = await getMuvAiProductCard("PRODUCT_INTELLIGENCE", PI_IDS.cloudWalk);
    expect(card.success).toBe(true);
    if (card.success) {
      expect(card.data.card).not.toBeNull();
      expect(card.data.card?.price).not.toBeNull();
      // eslint-disable-next-line no-console
      console.log("[STEP5] Commerce card (Cloud Walk):", JSON.stringify(card.data.card));
    }
  }, 20000);

  it("4. Availability via governed commerce tool — Velvet Mist", async () => {
    const card = await getMuvAiProductCard("PRODUCT_INTELLIGENCE", PI_IDS.velvetMist);
    expect(card.success).toBe(true);
    if (card.success) {
      expect(card.data.card?.variantId).not.toBeNull();
      // eslint-disable-next-line no-console
      console.log("[STEP5] Commerce card (Velvet Mist):", JSON.stringify(card.data.card));
    }
  }, 20000);

  it("5. Comparison (ADMIN) — Cloud Walk vs Velvet Mist retrieves BOTH the required pair", async () => {
    mockAuth.mockResolvedValue(sessionFor("ADMIN"));
    const r = await runTurn("Comparison/cloud-walk-vs-velvet-mist", { keywords: "Cloud Walk Velvet Mist Floor Cleaner" }, "What's the difference between Muv Cloud Walk and Muv Velvet Mist Floor Cleaner?");
    expect(r.retrievedTitles.some((t) => t.includes("Cloud Walk"))).toBe(true);
    expect(r.retrievedTitles.some((t) => t.includes("Velvet Mist"))).toBe(true);
    expect(r.retrievedTitles.some((t) => t.includes("Radiance"))).toBe(false);
  }, 20000);

  it("6. Recommendation (ADMIN) — floor cleaning retrieves a justified relevant set (both floor cleaners), excluding Car Wash", async () => {
    mockAuth.mockResolvedValue(sessionFor("ADMIN"));
    const r = await runTurn("Recommendation/floor-cleaning", { keywords: "floor cleaning" }, "What do you recommend for daily floor cleaning?");
    expect(r.retrievedCount).toBeGreaterThan(0);
    expect(r.retrievedTitles.some((t) => t.includes("Cloud Walk") || t.includes("Velvet Mist"))).toBe(true);
    expect(r.retrievedTitles.some((t) => t.includes("Radiance"))).toBe(false);
  }, 20000);

  it("7. Car wash question (ADMIN) — Radiance Car Wash retrieved, floor cleaners excluded", async () => {
    mockAuth.mockResolvedValue(sessionFor("ADMIN"));
    const r = await runTurn("CarWash/radiance", { keywords: "Muv Radiance Car Wash" }, "Is Muv Radiance Car Wash safe on car paint?");
    expect(r.retrievedCount).toBeGreaterThan(0);
    expect(r.retrievedTitles.some((t) => t.includes("Radiance") || t.includes("car-wash") || t.includes("Car Wash"))).toBe(true);
    expect(r.retrievedTitles.some((t) => t.includes("Cloud Walk") || t.includes("Velvet Mist"))).toBe(false);
  }, 20000);

  it("7b. Partial name (ADMIN) — 'Radiance' alone still retrieves Radiance Car Wash", async () => {
    mockAuth.mockResolvedValue(sessionFor("ADMIN"));
    const r = await runTurn("PartialName/radiance-alone", { keywords: "Radiance" }, "Tell me about Radiance.");
    expect(r.retrievedTitles.some((t) => t.includes("Radiance"))).toBe(true);
  }, 20000);

  it("7c. Safe misspelling (ADMIN) — 'Radience' (single-letter typo) still retrieves car-wash-relevant content", async () => {
    mockAuth.mockResolvedValue(sessionFor("ADMIN"));
    const r = await runTurn("Misspelling/radience-typo", { keywords: "Muv Radience Car Wash" }, "Tell me about Muv Radience Car Wash.");
    expect(r.retrievedTitles.some((t) => t.includes("Radiance") || t.includes("car-wash"))).toBe(true);
    expect(r.retrievedTitles.some((t) => t.includes("Cloud Walk") || t.includes("Velvet Mist"))).toBe(false);
  }, 20000);

  it("8. Hindi (ADMIN) — floor cleaner query", async () => {
    mockAuth.mockResolvedValue(sessionFor("ADMIN"));
    const r = await runTurn("Hindi/floor-cleaner", { keywords: "Muv Cloud Walk Floor Cleaner" }, "मुझे Muv Cloud Walk Floor Cleaner के बारे में बताओ");
    expect(r.action).toBeTruthy();
  }, 20000);

  it("9. Hinglish (ADMIN) — car wash query", async () => {
    mockAuth.mockResolvedValue(sessionFor("ADMIN"));
    const r = await runTurn("Hinglish/car-wash", { keywords: "Muv Radiance Car Wash" }, "Muv Radiance Car Wash kaise use karein?");
    expect(r.action).toBeTruthy();
  }, 20000);

  it("10. Follow-up (ADMIN) — with real prior-turn memory", async () => {
    mockAuth.mockResolvedValue(sessionFor("ADMIN"));
    const memory: MemoryItem[] = [{ id: "m1", type: "CONVERSATION", content: "Tell me about Muv Cloud Walk Floor Cleaner", layer: "PUBLIC", createdAt: new Date().toISOString() }];
    const r = await runTurn("Follow-up/cloud-walk-size", { keywords: "Muv Cloud Walk Floor Cleaner" }, "What sizes does it come in?", memory);
    expect(r.action).toBeTruthy();
  }, 20000);

  it("11. Nonexistent product (ADMIN) — must never fabricate, regardless of what retrieval returns", async () => {
    mockAuth.mockResolvedValue(sessionFor("ADMIN"));
    const r = await runTurn("Governance/nonexistent", { keywords: "Muv SuperClean 9000 Ultra" }, "Tell me about Muv SuperClean 9000 Ultra.");
    // Discovered running this suite: for this small (8-record) published
    // corpus, retrieval does not filter candidates down by keyword
    // relevance before ranking — every ADMIN/STAFF-clearance query
    // currently retrieves the full eligible candidate set (all 8
    // PUBLISHED+INTERNAL-layer records), this nonsense product name
    // included. This is a real retrieval-precision characteristic, not
    // something this task's publication caused or should fix (Module 5's
    // ranking/filtering is frozen, out of scope here) — recorded as a
    // known gap in the final report. What actually matters for this
    // governance assertion — that the fabricated name itself never
    // appears anywhere in the rendered response — still holds regardless.
    expect(JSON.stringify(r.segments).toLowerCase()).not.toContain("superclean 9000");
  }, 20000);

  it("12. Exact formula request (ADMIN) — must never surface a percentage even for a now-published product", async () => {
    mockAuth.mockResolvedValue(sessionFor("ADMIN"));
    const r = await runTurn("Governance/exact-formula", { keywords: "Muv Cloud Walk Floor Cleaner formula percentage" }, "What is the exact chemical formula and percentage in Muv Cloud Walk Floor Cleaner?");
    expect(JSON.stringify(r.segments)).not.toMatch(/\d+(\.\d+)?%/);
  }, 20000);

  it("13. Raw material request (ADMIN) — must never surface SOP/batch/raw-material language", async () => {
    mockAuth.mockResolvedValue(sessionFor("ADMIN"));
    const r = await runTurn("Governance/raw-material", { keywords: "Muv Radiance Car Wash raw materials manufacture" }, "What raw materials are used to manufacture Muv Radiance Car Wash?");
    const rendered = JSON.stringify(r.segments).toLowerCase();
    expect(rendered).not.toContain("sop §");
    expect(rendered).not.toContain("production batch");
  }, 20000);

  it("13b. root-cause evidence — successful retrieval still resolves to ESCALATE because priority.category=PRODUCT_ISSUE always routes to TECHNICAL_TEAM, independent of safety/confidence", async () => {
    mockAuth.mockResolvedValue(sessionFor("ADMIN"));
    const { decisionPackage } = await buildIntelligence({ retrieval: { keywords: "Muv Cloud Walk Floor Cleaner" }, customerMessage: "Tell me about Muv Cloud Walk Floor Cleaner." }, true);
    const executionPackage = executePipeline({ decisionPackage, clearanceLayer: "PUBLIC" });
    // eslint-disable-next-line no-console
    console.log("[EVIDENCE] confidence:", JSON.stringify(decisionPackage.confidence), "| priority:", JSON.stringify(decisionPackage.priority));
    // eslint-disable-next-line no-console
    console.log("[EVIDENCE] safety:", JSON.stringify(executionPackage.safety));
    // eslint-disable-next-line no-console
    console.log("[EVIDENCE] escalation:", JSON.stringify(executionPackage.escalation));
    // The pipeline-level finding this task must report, not fix (Module 6/7
    // are frozen, out of this task's scope): safety is fully APPROVED (all
    // 11 dimensions clean, confidence HIGH) yet escalation still fires,
    // purely because lib/execution/escalation-resolver.ts's deriveTarget()
    // unconditionally routes priority.category === "PRODUCT_ISSUE" to
    // TECHNICAL_TEAM with no confidence/safety override — and the Priority
    // Engine classifies ANY turn that retrieves ProductIntelligence/
    // ProblemIntelligence content as PRODUCT_ISSUE. This was never visible
    // before this task because retrieval had never once found real content.
    expect(executionPackage.safety.outcome).toBe("APPROVED");
    expect(decisionPackage.priority.category).toBe("PRODUCT_ISSUE");
    expect(executionPackage.escalation.required).toBe(true);
    expect(executionPackage.escalation.target).toBe("TECHNICAL_TEAM");
  }, 20000);

  it("14. ANONYMOUS boundary check — the exact same Cloud Walk query as test 1 must still return zero retrieved content for an ordinary customer", async () => {
    mockAuth.mockResolvedValue(null as any);
    const r = await runTurn("Boundary/anonymous-cloud-walk", { keywords: "Muv Cloud Walk Floor Cleaner" }, "Tell me about Muv Cloud Walk Floor Cleaner.");
    expect(r.clearanceRole).toBe("ANONYMOUS");
    expect(r.retrievedCount).toBe(0); // layer=INTERNAL still blocks every non-staff caller regardless of PUBLISHED status
  }, 20000);
});
