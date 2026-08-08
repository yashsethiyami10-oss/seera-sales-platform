import type { CognitiveState, PersonalityDirective } from "./types";

/**
 * EIOS Runtime — Personality composition (Sprint 9). The one deliverable
 * with no pre-existing analogue anywhere in the codebase (confirmed by
 * research before this sprint started — lib/intelligence/eq-engine.ts
 * reads the *customer's* emotional signal and explicitly disclaims being
 * a personality read). Built fresh, but minimally: composes the agent's
 * own base profile (AiAgentDefinition.personalityProfile, Sprint 9's one
 * new field) with a small, fixed modulation table keyed by the
 * CognitiveState Module 6's signals already selected — never invents a
 * persona unrelated to either input.
 */

const NEUTRAL_BASE = { tone: "clear and helpful", formality: "moderate" as const, pace: "steady" };

const MODULATION: Record<CognitiveState, { toneSuffix: string; paceSuffix: string; formality?: "casual" | "moderate" | "formal" }> = {
  STANDARD: { toneSuffix: "", paceSuffix: "" },
  CAUTIOUS_REASSURING: { toneSuffix: ", calm and reassuring", paceSuffix: ", unhurried", formality: "moderate" },
  ESCALATE_TO_HUMAN: { toneSuffix: ", direct and honest about needing human follow-up", paceSuffix: "", formality: "formal" },
  EDUCATIONAL: { toneSuffix: ", patient and explanatory", paceSuffix: ", unhurried" },
  TRANSPARENT_LIMITED_EVIDENCE: { toneSuffix: ", explicit about the limits of what is known here", paceSuffix: "" },
};

function readBaseProfile(personalityProfile: unknown): { tone: string; formality: "casual" | "moderate" | "formal"; pace: string } {
  if (personalityProfile && typeof personalityProfile === "object" && !Array.isArray(personalityProfile)) {
    const p = personalityProfile as Record<string, unknown>;
    const tone = typeof p.tone === "string" && p.tone.trim() ? p.tone : NEUTRAL_BASE.tone;
    const formality = p.formality === "casual" || p.formality === "moderate" || p.formality === "formal" ? p.formality : NEUTRAL_BASE.formality;
    const pace = typeof p.pace === "string" && p.pace.trim() ? p.pace : NEUTRAL_BASE.pace;
    return { tone, formality, pace };
  }
  // No profile set on this agent — EIOS's own documented neutral fallback,
  // never a fabricated persona (see the schema comment on personalityProfile).
  return NEUTRAL_BASE;
}

export function composePersonality(agent: { name: string; purpose: string; personalityProfile: unknown }, cognitiveState: CognitiveState): PersonalityDirective {
  const base = readBaseProfile(agent.personalityProfile);
  const modulation = MODULATION[cognitiveState];

  const tone = `${base.tone}${modulation.toneSuffix}`;
  const pace = `${base.pace}${modulation.paceSuffix}`;
  const formality = modulation.formality ?? base.formality;

  const directive = `As ${agent.name} (${agent.purpose}): respond in a ${tone} tone, ${formality} register, at a ${pace} pace.`;

  return { tone, formality, pace, directive };
}
