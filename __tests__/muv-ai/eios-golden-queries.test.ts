import { describe, it, expect } from "vitest";
import { runEiosRuntime } from "@/lib/eios/runtime";
import type { CognitiveState, VerificationGateDecision } from "@/lib/eios/types";

/**
 * MUV AI Engineering Execution — Sprint 10: Verification and Cognitive
 * Execution. The "Golden Query Set" — a fixed, checked-in matrix of
 * representative customer messages replayed through the real EIOS Runtime
 * (lib/eios/runtime.ts's runEiosRuntime, which itself runs the real,
 * unmodified Module 6 buildIntelligence pipeline underneath — nothing here
 * is mocked or stubbed).
 *
 * Two prior scenario-matrix efforts already exist in this repo and are
 * NOT duplicated here: __tests__/muv-ai/torture.test.ts (105 scenarios)
 * exercises the *customer-facing* Experience/Wave 2 pipeline
 * (orchestrateExperience -> buildIntelligence -> executePipeline) for
 * safety/leakage/crash-resistance only — it never asserts which cognitive
 * state or gate decision was chosen. This file targets a different
 * question — given Module 6's real Priority/EQ/CQ/Confidence output for a
 * message, does EIOS's Cognitive State selection and Self-Verification
 * Gate (Sprint 9) make the *correct, traceable* decision — and there was
 * no existing test for that question anywhere in the codebase before this
 * sprint (confirmed by repo-wide research before writing this file).
 *
 * Honest environmental note: this dev/test database has little to no
 * PUBLISHED Product/Problem/Care Intelligence content (confirmed in
 * Sprint 8's own verification run — zero PUBLISHED ProductIntelligenceVersion
 * rows by default). That means `retrievedKnowledge` is realistically empty
 * for most of these scenarios, which pushes confidence toward LOW by
 * Module 6's own "never manufacture confidence" design. Rather than assert
 * a specific cognitive state that depends on retrieval hits this
 * environment can't guarantee, most scenarios below assert the INVARIANTS
 * that must hold regardless of retrieval content (gate/state consistency
 * rules) — the SAFETY and negative-emotion scenarios assert a specific
 * expected state because those outcomes are driven entirely by the fixed,
 * deterministic keyword lexicons in priority-engine.ts/eq-engine.ts, not
 * by database content, so they hold in any environment.
 */

const STUB_AGENT = { name: "Golden Query Test Agent", purpose: "Sprint 10 verification", personalityProfile: { tone: "clear and helpful", formality: "moderate" as const, pace: "steady" } };

type Scenario = {
  label: string;
  message: string;
  /** Only set where the outcome is fully determined by the fixed keyword
   * lexicons, independent of retrieval content. */
  expectedCognitiveState?: CognitiveState;
};

const SCENARIOS: Scenario[] = [
  // --- SAFETY (6): always escalates, regardless of confidence/retrieval — proven deterministic by cq-engine.ts's `escalationNeed = priority.category === "SAFETY" || ...` ---
  { label: "safety-1-allergic", message: "My child had an allergic reaction after using this, is that dangerous?", expectedCognitiveState: "ESCALATE_TO_HUMAN" },
  { label: "safety-2-burn", message: "I got burned using this product, what should I do?", expectedCognitiveState: "ESCALATE_TO_HUMAN" },
  { label: "safety-3-toxic", message: "Is this toxic if swallowed by accident?", expectedCognitiveState: "ESCALATE_TO_HUMAN" },
  { label: "safety-4-fire-hazard", message: "This smells like it could be a fire hazard, is that a danger?", expectedCognitiveState: "ESCALATE_TO_HUMAN" },
  { label: "safety-5-emergency", message: "This is an emergency, my skin is injured after using it", expectedCognitiveState: "ESCALATE_TO_HUMAN" },
  { label: "safety-6-hospital", message: "I had to go to the hospital after this, was it unsafe?", expectedCognitiveState: "ESCALATE_TO_HUMAN" },

  // --- COMPLAINT + negative emotion (5): COMPLAINT is a HIGH_URGENCY_CATEGORIES member, so negative emotion + complaint also escalates ---
  { label: "complaint-angry-1", message: "This is unacceptable, the product arrived broken and I'm furious", expectedCognitiveState: "ESCALATE_TO_HUMAN" },
  { label: "complaint-angry-2", message: "I'm disappointed, this is defective and outrageous", expectedCognitiveState: "ESCALATE_TO_HUMAN" },
  { label: "complaint-angry-3", message: "Ridiculous — I want a refund, this is not working at all", expectedCognitiveState: "ESCALATE_TO_HUMAN" },
  { label: "complaint-angry-4", message: "Wrong item sent, I'm furious about this", expectedCognitiveState: "ESCALATE_TO_HUMAN" },
  { label: "complaint-angry-5", message: "This is a scam, the item is defective and unacceptable", expectedCognitiveState: "ESCALATE_TO_HUMAN" },

  // --- Negative emotion WITHOUT a high-urgency category (6): reassuranceNeeded fires, escalationNeed does not -> CAUTIOUS_REASSURING ---
  { label: "negative-no-escalation-1", message: "This product is terrible, I expected better", expectedCognitiveState: "CAUTIOUS_REASSURING" },
  { label: "negative-no-escalation-2", message: "Honestly this was a poor experience overall", expectedCognitiveState: "CAUTIOUS_REASSURING" },
  { label: "negative-no-escalation-3", message: "The packaging was awful, just so you know", expectedCognitiveState: "CAUTIOUS_REASSURING" },
  { label: "negative-no-escalation-4", message: "This is bad, not what I hoped for at all", expectedCognitiveState: "CAUTIOUS_REASSURING" },
  { label: "negative-no-escalation-5", message: "Kind of a disappointing purchase if I'm honest", expectedCognitiveState: "CAUTIOUS_REASSURING" },
  { label: "negative-no-escalation-6", message: "I'm worried this might not be right for sensitive skin", expectedCognitiveState: "CAUTIOUS_REASSURING" },

  // --- Confusion / curiosity (4): only asserted as an invariant, since confidence LOW would override to TRANSPARENT_LIMITED_EVIDENCE in this sparse environment — see file header ---
  { label: "confused-1", message: "I'm confused, what does this ingredient actually do?" },
  { label: "confused-2", message: "I don't understand how this works, can you explain?" },
  { label: "curious-1", message: "Just a quick question out of curiosity — how is this made?" },
  { label: "curious-2", message: "Wondering if you could tell me more about this" },

  // --- Sales / commercial intent (4) ---
  { label: "sales-1-bulk", message: "I'd like a quotation for a bulk order, what's the wholesale price?" },
  { label: "sales-2-buy", message: "I want to buy this, can I get a discount?" },
  { label: "sales-3-purchase", message: "Interested in purchasing several units, any offers?" },
  { label: "sales-4-price", message: "What's the price for a large quantity?" },

  // --- Urgency (3) ---
  { label: "urgency-1", message: "I need this urgently, can you help right now?" },
  { label: "urgency-2", message: "Need an answer immediately, it's for today" },
  { label: "urgency-3", message: "This is time sensitive, asap please" },

  // --- General / neutral inquiries (6) ---
  { label: "general-1", message: "Hello, can you tell me about your products?" },
  { label: "general-2", message: "What categories do you sell?" },
  { label: "general-3", message: "Do you ship internationally?" },
  { label: "general-4", message: "What are your store hours?" },
  { label: "general-5", message: "Can I get more information about your company?" },
  { label: "general-6", message: "Just browsing, nothing specific in mind" },

  // --- Satisfied / positive (4) — should never escalate or block on trust grounds ---
  { label: "positive-1", message: "Thank you, this works really well and I'm happy with it" },
  { label: "positive-2", message: "Great product, I love it" },
  { label: "positive-3", message: "Excellent experience overall, thanks" },
  { label: "positive-4", message: "Amazing, works exactly as expected" },

  // --- Edge inputs (2) ---
  { label: "edge-empty", message: "" },
  { label: "edge-very-short", message: "?" },
];

describe("EIOS Golden Query Set (Sprint 10) — 40-scenario cognitive execution replay", () => {
  it(`the Golden Query Set contains exactly 40 scenarios`, () => {
    expect(SCENARIOS.length).toBe(40);
  });

  it.each(SCENARIOS)("[$label] produces an internally consistent EIOS decision", async ({ label, message, expectedCognitiveState }) => {
    const result = await runEiosRuntime({ retrieval: { keywords: message || undefined }, customerMessage: message || undefined }, STUB_AGENT, false);

    // --- Structural invariants — must hold for every scenario, regardless of retrieval content ---
    const validStates: CognitiveState[] = ["STANDARD", "CAUTIOUS_REASSURING", "ESCALATE_TO_HUMAN", "EDUCATIONAL", "TRANSPARENT_LIMITED_EVIDENCE"];
    expect(validStates).toContain(result.cognitiveState);

    const validDecisions: VerificationGateDecision[] = ["PASS", "ESCALATE", "BLOCK"];
    expect(validDecisions).toContain(result.gate.decision);

    // The gate never manufactures confidence — its reported score/level must
    // be exactly what Module 6's DecisionPackage computed, never overridden.
    expect(result.gate.confidenceScore).toBe(result.decisionPackage.confidence.score);
    expect(result.gate.confidenceLevel).toBe(result.decisionPackage.confidence.level);

    // BLOCK <=> LOW confidence; ESCALATE only when confidence is not LOW
    // AND CQ actually flagged escalation — both directions checked, so a
    // regression that weakens the gate in *either* direction fails here.
    if (result.gate.decision === "BLOCK") expect(result.gate.confidenceLevel).toBe("LOW");
    if (result.gate.confidenceLevel === "LOW") expect(result.gate.decision).toBe("BLOCK");
    if (result.gate.decision === "ESCALATE") {
      expect(result.gate.confidenceLevel).not.toBe("LOW");
      expect(result.decisionPackage.cqSummary.escalationNeed).toBe(true);
    }

    // Escalation always wins the Cognitive State priority order — if CQ
    // flagged escalation, the state must be ESCALATE_TO_HUMAN, full stop.
    if (result.decisionPackage.cqSummary.escalationNeed) {
      expect(result.cognitiveState).toBe("ESCALATE_TO_HUMAN");
    }

    // Personality composition never crashes and always produces real text.
    expect(result.personality.directive.length).toBeGreaterThan(0);
    expect(result.personality.tone.length).toBeGreaterThan(0);
    expect(["casual", "moderate", "formal"]).toContain(result.personality.formality);

    // --- Deterministic, environment-independent expectations ---
    if (expectedCognitiveState) {
      expect(result.cognitiveState, `[${label}] expected cognitive state ${expectedCognitiveState}, got ${result.cognitiveState} (priority=${result.decisionPackage.priority.category}/${result.decisionPackage.priority.level}, eq=${result.decisionPackage.eqSummary.state}, confidence=${result.decisionPackage.confidence.level})`).toBe(expectedCognitiveState);
    }
  });

  it("a SAFETY-triggering message never PASSes silently — it is either ESCALATEd or BLOCKed with escalation flagged, never treated as a routine PASS", async () => {
    const result = await runEiosRuntime({ retrieval: { keywords: "allergic reaction emergency" }, customerMessage: "I had an allergic reaction, this feels like an emergency" }, STUB_AGENT, false);
    expect(result.decisionPackage.cqSummary.escalationNeed).toBe(true);
    if (result.gate.decision === "PASS") throw new Error("A safety-flagged scenario must never silently PASS");
    expect(result.gate.escalationRecommended).toBe(true);
  });

  it("an empty customer message degrades safely — UNKNOWN emotional state, no crash, no fabricated escalation", async () => {
    const result = await runEiosRuntime({ retrieval: {}, customerMessage: undefined }, STUB_AGENT, false);
    expect(result.decisionPackage.eqSummary.state).toBe("UNKNOWN");
    expect(result.decisionPackage.cqSummary.escalationNeed).toBe(false);
  });
});
