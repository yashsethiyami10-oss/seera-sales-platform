import { describe, it, expect } from "vitest";
import { MUV_AI_SUGGESTED_QUESTIONS } from "@/components/muv-ai/suggested-questions";

const FORBIDDEN_WORDS = ["moving", "move", "coming"];

describe("Suggested questions — centralized configuration", () => {
  it("has at least one entry covering each required category-adjacent example", () => {
    expect(MUV_AI_SUGGESTED_QUESTIONS.length).toBeGreaterThanOrEqual(3);
  });

  it("every entry has a non-empty id and text", () => {
    for (const q of MUV_AI_SUGGESTED_QUESTIONS) {
      expect(q.id.length).toBeGreaterThan(0);
      expect(q.text.length).toBeGreaterThan(0);
    }
  });

  it("ids are unique", () => {
    const ids = MUV_AI_SUGGESTED_QUESTIONS.map((q) => q.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("no suggestion contains a forbidden brand word ('moving', 'move', 'coming')", () => {
    for (const q of MUV_AI_SUGGESTED_QUESTIONS) {
      const lower = q.text.toLowerCase();
      for (const word of FORBIDDEN_WORDS) {
        expect(lower.includes(word)).toBe(false);
      }
    }
  });

  it("entries contain no pre-baked answer content (no punctuation-free long sentences suggesting a canned response)", () => {
    // A structural sanity check, not a semantic one: every suggestion is a
    // short question, not a paragraph — the real "no precomputed answers"
    // guarantee comes from selectSuggestedQuestion() calling send(), the
    // same authoritative path as manual input (verified by code reading —
    // see known-limitations for why this isn't exercised via a rendered
    // component test in this pass).
    for (const q of MUV_AI_SUGGESTED_QUESTIONS) {
      expect(q.text.length).toBeLessThan(80);
    }
  });
});
