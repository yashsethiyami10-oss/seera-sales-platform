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
import { getMuvAiProductCard } from "@/actions/muv-ai-beta";
import type { IntelligenceRequest } from "@/lib/intelligence/types";

/**
 * Final Precedence Rule Refinement — focused UAT. Provider OFF. Verifies
 * "Confidentiality takes precedence over Answerability": an explicit
 * request for confidential formulation/manufacturing information must
 * decline honestly, never substitute a generic product answer, for a
 * question that would otherwise be Answerability-eligible.
 */

function adminSession(): any {
  return { user: { id: "test-user-admin", role: "ADMIN" } };
}

async function runTurn(label: string, retrieval: IntelligenceRequest["retrieval"], customerMessage: string) {
  mockAuth.mockResolvedValue(adminSession());
  const { decisionPackage } = await buildIntelligence({ retrieval, customerMessage }, false);
  const executionPackage = executePipeline({ decisionPackage, clearanceLayer: "PUBLIC", customerMessage });
  const experienceResponse = buildExperienceResponse("confidentiality-precedence-session", executionPackage);
  const view = adaptForWebsite(experienceResponse);
  const result = {
    action: executionPackage.action.action,
    segments: view.segments.map((s) => ({ kind: s.kind, content: s.content })),
  };
  // eslint-disable-next-line no-console
  console.log(`\n[PRECEDENCE] ${label}\n  action=${result.action}\n  segments=${JSON.stringify(result.segments)}`);
  return result;
}

describe("Final Precedence Rule Refinement — Confidentiality over Answerability (provider OFF)", () => {
  it("0. provider remains inactive", () => {
    expect(process.env.GATEWAY_LLM_PROVIDER ?? "").toBe("");
  });

  it("1. 'What percentage of SLES is used?' — governed refusal, not a generic answer, and no false escalation promise", async () => {
    const r = await runTurn("Formula/SLES", { keywords: "Muv Radiance Car Wash" }, "What percentage of SLES is used in Radiance Car Wash?");
    expect(r.action).toBe("DECLINE_CONFIDENTIAL");
    const rendered = JSON.stringify(r.segments).toLowerCase();
    expect(rendered).not.toMatch(/\d+(\.\d+)?%/);
    expect(rendered).not.toContain("here's a product that matches");
    // No genuine escalation happens for a DECLINE_CONFIDENTIAL action --
    // showing "a team member will follow up" here would be false.
    expect(r.segments.some((s) => s.kind === "ESCALATION_NOTICE")).toBe(false);
  }, 20000);

  it("2. 'Share your formulation for Cloud Walk.' — governed refusal", async () => {
    const r = await runTurn("Formula/ShareFormulation", { keywords: "Muv Cloud Walk Floor Cleaner" }, "Share your formulation for Muv Cloud Walk Floor Cleaner.");
    expect(r.action).toBe("DECLINE_CONFIDENTIAL");
  }, 20000);

  it("3. 'What ingredients are inside Cloud Walk?' — only public-safe info, never a refusal for a bare ingredients question", async () => {
    const r = await runTurn("Ingredients/CloudWalk", { keywords: "Muv Cloud Walk Floor Cleaner" }, "What ingredients are inside Muv Cloud Walk Floor Cleaner?");
    expect(r.action).not.toBe("DECLINE_CONFIDENTIAL");
    const rendered = JSON.stringify(r.segments).toLowerCase();
    expect(rendered).not.toContain("sles");
    expect(rendered).not.toContain("cocamidopropyl");
  }, 20000);

  it("4. 'How do I use Cloud Walk?' — normal governed answer, unaffected", async () => {
    const r = await runTurn("Normal/Usage", { keywords: "Muv Cloud Walk Floor Cleaner" }, "How do I use Muv Cloud Walk Floor Cleaner?");
    expect(r.action).not.toBe("DECLINE_CONFIDENTIAL");
  }, 20000);

  it("5. 'What is the price of Radiance Car Wash?' — normal governed answer using commerce, unaffected", async () => {
    const r = await runTurn("Normal/Price", { keywords: "Muv Radiance Car Wash" }, "What is the price of Muv Radiance Car Wash?");
    expect(r.action).not.toBe("DECLINE_CONFIDENTIAL");
    const card = await getMuvAiProductCard("PRODUCT_INTELLIGENCE", "cmsi2dmt101qvrr9t2x7ouv65");
    expect(card.success).toBe(true);
    if (card.success) expect(card.data.card?.price).not.toBeNull();
  }, 20000);

  it("6. Hindi/Hinglish formula request — governed refusal", async () => {
    const r = await runTurn("Formula/Hinglish", { keywords: "Muv Radiance Car Wash" }, "Iska formula kya hai, Muv Radiance Car Wash mein?");
    expect(r.action).toBe("DECLINE_CONFIDENTIAL");
  }, 20000);

  it("7. Hinglish SLES-specific request — governed refusal via existing scanner vocabulary", async () => {
    const r = await runTurn("Formula/HinglishSLES", { keywords: "Muv Radiance Car Wash" }, "Uske SLES ka percentage kitna hai?");
    expect(r.action).toBe("DECLINE_CONFIDENTIAL");
  }, 20000);

  it("8. Non-confidential product FAQ — unaffected", async () => {
    const r = await runTurn("Normal/FAQ", { keywords: "Muv Velvet Mist Floor Cleaner" }, "What are the benefits of Muv Velvet Mist Floor Cleaner?");
    expect(r.action).not.toBe("DECLINE_CONFIDENTIAL");
  }, 20000);
});
