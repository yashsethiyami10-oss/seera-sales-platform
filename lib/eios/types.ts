/**
 * MUV Enterprise Intelligence Operating System (EIOS) Runtime — Sprint 9.
 *
 * EIOS is a coordination layer, not a third scoring engine. Per the
 * Founder's explicit decision on this sprint's scope: the Self-Verification
 * Gate and Cognitive State selection are built directly on top of the
 * already-existing lib/intelligence/* (Module 6) confidence/CQ engines —
 * this file only defines the NEW output shapes EIOS itself introduces
 * (gate decisions, named cognitive states, personality directives), never
 * redeclaring anything Module 6 already owns (ConfidenceEvaluation,
 * CQResult, DecisionPackage are imported from lib/intelligence/types.ts
 * wherever needed, not copied here).
 */

/** A small, fixed, named vocabulary — not a free-text field — so every
 * consumer (prompt assembly, telemetry, a future admin dashboard) can
 * branch on a known set rather than parsing prose. Deliberately coarse:
 * this selects an operating *mode*, not a full behavioral script. */
export type CognitiveState =
  | "STANDARD" // no elevated signal from Priority/EQ/CQ — proceed normally
  | "CAUTIOUS_REASSURING" // negative emotion and/or elevated trust risk, no hard escalation yet
  | "ESCALATE_TO_HUMAN" // CQ.escalationNeed is true — EIOS recommends handoff, does not silently continue
  | "EDUCATIONAL" // confusion/education need signal, no urgency
  | "TRANSPARENT_LIMITED_EVIDENCE"; // confidence is LOW — state this limitation rather than sound falsely certain

export type VerificationGateDecision = "PASS" | "ESCALATE" | "BLOCK";

export type VerificationGateResult = {
  decision: VerificationGateDecision;
  reason: string;
  confidenceScore: number;
  confidenceLevel: "LOW" | "MODERATE" | "HIGH";
  escalationRecommended: boolean;
};

export type PersonalityDirective = {
  tone: string;
  formality: "casual" | "moderate" | "formal";
  pace: string;
  /** Human-readable, assembled from the agent's base personalityProfile +
   * the selected CognitiveState's modulation — this is what gets threaded
   * into prompt assembly / stored for transparency, never re-derived by a
   * downstream consumer. */
  directive: string;
};
