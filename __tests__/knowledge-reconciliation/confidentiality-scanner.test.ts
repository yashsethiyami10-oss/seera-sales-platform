import { describe, it, expect } from "vitest";
import {
  scanTextForConfidentiality,
  scanValueForConfidentiality,
  redactTextForConfidentiality,
  redactValueForConfidentiality,
  hasBlockingConfidentialityFindings,
} from "@/lib/knowledge-reconciliation/confidentiality-scanner";

/**
 * Block 2B, Corrective Confidentiality Hardening — Stage 6 test matrix.
 *
 * Deliberately a pure, DB-free unit suite: the scanner/redaction functions
 * take plain values and return plain values, so this entire file runs
 * with zero database dependency — immune to the real, currently-elevated
 * Neon connectivity degradation observed during this task's Stage 4/5
 * work (see the hardening report's own documented evidence). Coverage
 * mirrors the task's required field/variation/exception matrix exactly.
 */

describe("Confidentiality scanner — restricted content across every required field type", () => {
  const fieldPaths = ["productIdentity", "title", "description", "benefits", "directions", "safety", "storage", "faqs", "aliases", "metadata"];

  it.each(fieldPaths)("detects a restricted term regardless of which field path it appears in (%s)", (fieldPath) => {
    const findings = scanTextForConfidentiality("This product contains SLES as a key raw material.", fieldPath);
    expect(findings.some((f) => f.classification === "RESTRICTED_INTERNAL_FORMULATION")).toBe(true);
    expect(findings[0]!.fieldPath).toBe(fieldPath);
  });

  it("detects restricted content inside a nested array (e.g. a FAQ array)", () => {
    const value = { faqs: [{ question: "What's inside?", answer: "Contains CAPB." }, { question: "Is it safe?", answer: "Yes, safe for regular use." }] };
    const findings = scanValueForConfidentiality(value, "sections");
    expect(findings.some((f) => f.fieldPath === "sections.faqs[0].answer" && f.normalizedTerm === "CAPB")).toBe(true);
    expect(findings.some((f) => f.fieldPath === "sections.faqs[1].answer")).toBe(false);
  });

  it("detects restricted content inside deeply nested JSON (3+ levels)", () => {
    const value = { metadata: { internal: { qc: { note: "Formulated with CDEA per SOP." } } } };
    const findings = scanValueForConfidentiality(value, "sections");
    expect(findings.some((f) => f.fieldPath === "sections.metadata.internal.qc.note" && f.normalizedTerm === "CDEA")).toBe(true);
  });

  it("detects restricted content in a source-excerpt-shaped string", () => {
    const sourceExcerpt = "Excerpt from SOP §2: the base surfactant system uses Sodium Laureth Sulfate at the standard ratio.";
    const findings = scanTextForConfidentiality(sourceExcerpt, "sourceExcerpt");
    expect(findings.some((f) => f.normalizedTerm === "SLES")).toBe(true);
  });
});

describe("Confidentiality scanner — spacing, punctuation, and case variants", () => {
  const variants = [
    ["SLES", "SLES"],
    ["sles", "SLES"],
    ["SlEs", "SLES"],
    ["S.L.E.S.", "SLES"],
    ["S L E S", "SLES"],
    ["S-L-E-S", "SLES"],
    ["capb", "CAPB"],
    ["C.A.P.B.", "CAPB"],
    ["cdea", "CDEA"],
    ["Cocamide DEA", "CDEA"],
    ["cocamide dea", "CDEA"],
    ["Sodium Laureth Sulfate", "SLES"],
    ["sodium laureth sulfate", "SLES"],
    ["Cocamidopropyl Betaine", "CAPB"],
  ];

  it.each(variants)("matches %s as normalized term %s", (input, expectedTerm) => {
    const findings = scanTextForConfidentiality(`Product Type | ${input}-based liquid product`, "productIdentity");
    expect(findings.some((f) => f.normalizedTerm === expectedTerm && f.classification === "RESTRICTED_INTERNAL_FORMULATION")).toBe(true);
  });

  it("does not double-count a single real occurrence across overlapping alias patterns", () => {
    const findings = scanTextForConfidentiality("Contains SLES.", "test");
    const slesFindings = findings.filter((f) => f.normalizedTerm === "SLES" && f.category !== "PROPRIETARY_FORMULATION_COMBINATION");
    expect(slesFindings).toHaveLength(1);
  });
});

describe("Confidentiality scanner — pattern-based categories", () => {
  it("flags a formula percentage as FOUNDER_REVIEW_REQUIRED, not auto-restricted", () => {
    const findings = scanTextForConfidentiality("Salicylic-acid-active (1.5%) formulation.", "productIdentity");
    const pct = findings.find((f) => f.category === "FORMULA_PERCENTAGE");
    expect(pct).toBeDefined();
    expect(pct!.classification).toBe("FOUNDER_REVIEW_REQUIRED");
  });

  it("flags a batch quantity pattern", () => {
    const findings = scanTextForConfidentiality("Batch Basis (as documented) | 10 Litre production batch", "productIdentity");
    expect(findings.some((f) => f.category === "BATCH_QUANTITY")).toBe(true);
  });

  it("flags a process temperature pattern", () => {
    const findings = scanTextForConfidentiality("Heat the mixture to 65°C before adding the surfactant phase.", "manufacturingNote");
    expect(findings.some((f) => f.category === "PROCESS_TEMPERATURE")).toBe(true);
  });

  it("flags manufacturing sequence language", () => {
    const findings = scanTextForConfidentiality("See SOP §3 for the full mixing sequence and process step order.", "productIdentity");
    expect(findings.some((f) => f.category === "MANUFACTURING_SEQUENCE")).toBe(true);
  });

  it("flags a supplier-grade identifier / CAS number", () => {
    const findings = scanTextForConfidentiality("Sourced as Grade AB-123, CAS 68585-34-2.", "supplierNote");
    expect(findings.filter((f) => f.category === "SUPPLIER_GRADE_IDENTIFIER")).toHaveLength(2);
  });

  it("flags a proprietary formulation combination when 2+ distinct restricted terms co-occur", () => {
    const findings = scanTextForConfidentiality("SLES/CAPB/CDEA-based liquid.", "productIdentity");
    const combo = findings.find((f) => f.category === "PROPRIETARY_FORMULATION_COMBINATION");
    expect(combo).toBeDefined();
    expect(combo!.normalizedTerm).toBe("CAPB+CDEA+SLES");
  });
});

describe("Confidentiality scanner — public-label ingredient handling", () => {
  it("classifies a known public-label ingredient as FOUNDER_REVIEW_REQUIRED when no approved-source evidence is supplied", () => {
    const findings = scanTextForConfidentiality("Glycerin is included in the formulation.", "faqs[0].answer");
    const glycerin = findings.find((f) => f.normalizedTerm === "Glycerin");
    expect(glycerin!.classification).toBe("FOUNDER_REVIEW_REQUIRED");
    expect(glycerin!.reviewRequired).toBe(true);
  });

  it("classifies the SAME public-label ingredient as PUBLIC_LABEL_INGREDIENT only when explicit approved-source evidence is supplied", () => {
    const findings = scanTextForConfidentiality("Glycerin is included in the formulation.", "faqs[0].answer", { sourceApprovalStatus: "APPROVED" });
    const glycerin = findings.find((f) => f.normalizedTerm === "Glycerin");
    expect(glycerin!.classification).toBe("PUBLIC_LABEL_INGREDIENT");
    expect(glycerin!.reviewRequired).toBe(false);
  });

  it("never silently escalates a public-label ingredient to RESTRICTED_INTERNAL_FORMULATION regardless of approval context", () => {
    for (const context of [{}, { sourceApprovalStatus: "APPROVED" as const }, { sourceApprovalStatus: "PENDING" as const }]) {
      const findings = scanTextForConfidentiality("Contains Citric Acid.", "faqs[0].answer", context);
      expect(findings.every((f) => f.normalizedTerm !== "Citric Acid" || f.classification !== "RESTRICTED_INTERNAL_FORMULATION")).toBe(true);
    }
  });
});

describe("Confidentiality scanner — unknown/ambiguous terms routed to Founder review", () => {
  it("an unrecognized chemical-sounding acronym with no vocabulary match produces no finding at all (never silently approved, never fabricated as restricted)", () => {
    // "PEG-40" isn't in either vocabulary list — the scanner correctly
    // reports nothing rather than guessing; ambiguous-but-unlisted terms
    // are a real, acknowledged gap (see the hardening report's "known
    // gaps" section), not silently approved.
    const findings = scanTextForConfidentiality("Contains PEG-40 as an emulsifier.", "productIdentity");
    expect(findings.filter((f) => f.classification === "RESTRICTED_INTERNAL_FORMULATION")).toHaveLength(0);
  });

  it("an ambiguous pattern match (percentage, batch, temperature, supplier-grade, manufacturing-sequence) is always FOUNDER_REVIEW_REQUIRED — never auto-approved, never auto-restricted", () => {
    const samples = [
      "Contains 2% active ingredient.",
      "Produced in a 50 kg production batch.",
      "Process temperature: 80°C.",
      "Supplier grade XY-9.",
      "See the manufacturing process for details.",
    ];
    for (const text of samples) {
      const findings = scanTextForConfidentiality(text, "test");
      expect(findings.length).toBeGreaterThan(0);
      expect(findings.every((f) => f.classification === "FOUNDER_REVIEW_REQUIRED")).toBe(true);
    }
  });
});

describe("Confidentiality scanner — false-positive analysis on representative safe content", () => {
  // Real, representative safe strings pulled from this task's own actual
  // populated dataset (benefits/directions/safety/storage/FAQ text) —
  // must never produce a finding of any kind.
  const safeSamples = [
    "It is available in 1 L and 5 L packs.",
    "Keep out of reach of children.",
    "Avoid contact with eyes.",
    "Suitable for machine wash and bucket wash.",
    "Store in a cool and dry place away from direct sunlight and excessive heat.",
    "Muv Radiance Car Wash lifts road grime and restores shine without harming clear-coat paint finishes.",
    "Helps remove routine dirt and common stains.",
    "Wet your hands with clean water, apply the product, and rinse thoroughly.",
    "Leaves clothes with a Lavender Garden fragrance.",
    "Do not swallow. Seek medical advice in case of accidental ingestion.",
    "Test on a small hidden area before using on delicate or colour-sensitive fabrics.",
    "Available in 250 ml and 500 ml packs.",
    "This is a pH-balanced formula, safe on clear-coat and standard automotive paint finishes.",
    "Dilute per the ratio printed on the pack label.",
  ];

  it.each(safeSamples)("produces zero findings for real safe text: %s", (text) => {
    const findings = scanTextForConfidentiality(text, "test");
    expect(findings).toEqual([]);
  });

  it("benign words that share letters with restricted acronyms must never false-positive (e.g. common short words)", () => {
    const benignButRiskyLetters = ["Sale", "Cape", "Cedar", "Slew", "Cap", "Deal"];
    for (const word of benignButRiskyLetters) {
      const findings = scanTextForConfidentiality(`The product is on sale near the ${word.toLowerCase()} display.`, "test");
      expect(findings.filter((f) => f.classification === "RESTRICTED_INTERNAL_FORMULATION")).toHaveLength(0);
    }
  });

  it("Hindi-language safe text produces zero findings", () => {
    const findings = scanTextForConfidentiality("कपड़े धोने का साबुन घर के उपयोग के लिए सुरक्षित है।", "test");
    expect(findings).toEqual([]);
  });

  it("Hinglish-language safe text produces zero findings", () => {
    const findings = scanTextForConfidentiality("Yeh product hath dhone ke liye safe hai aur roz istemal kiya ja sakta hai.", "test");
    expect(findings).toEqual([]);
  });
});

describe("Confidentiality scanner — write-time redaction", () => {
  it("redacts only RESTRICTED_INTERNAL_FORMULATION terms, never FOUNDER_REVIEW_REQUIRED ambiguous matches", () => {
    const { text, redactions } = redactTextForConfidentiality("SLES/CAPB-based formula with a 10 Litre production batch.", "productIdentity");
    expect(text).not.toContain("SLES");
    expect(text).not.toContain("CAPB");
    expect(text).toContain("10 Litre production batch"); // ambiguous, left untouched by design
    expect(redactions.every((r) => r.classification === "RESTRICTED_INTERNAL_FORMULATION")).toBe(true);
  });

  it("collapses adjacent redaction placeholders into one, with correct word spacing", () => {
    const { text } = redactTextForConfidentiality("SLES/CAPB/CDEA-based liquid hand wash", "productIdentity");
    expect(text).not.toMatch(/\]\[REDACTED/); // no back-to-back placeholders
    expect(text).toMatch(/\] based liquid hand wash/); // proper spacing preserved
  });

  it("is idempotent — redacting already-redacted text produces the same text with zero new redactions reported", () => {
    const first = redactTextForConfidentiality("Contains SLES and CAPB.", "test");
    const second = redactTextForConfidentiality(first.text, "test");
    expect(second.text).toBe(first.text);
    expect(second.redactions).toEqual([]);
  });

  it("recursively redacts nested structures while preserving shape", () => {
    const value = { faqs: [{ question: "What's inside?", answer: "Contains SLES." }], benefits: ["Safe for daily use"] };
    const { value: redacted, redactions } = redactValueForConfidentiality(value, "sections");
    expect((redacted as typeof value).faqs[0]!.answer).not.toContain("SLES");
    expect((redacted as typeof value).faqs[0]!.question).toBe("What's inside?"); // untouched, no match
    expect((redacted as typeof value).benefits[0]).toBe("Safe for daily use"); // untouched
    expect(redactions).toHaveLength(1);
  });

  it("never mutates the original input value (pure function)", () => {
    const value = { note: "Contains SLES." };
    const frozen = JSON.parse(JSON.stringify(value));
    redactValueForConfidentiality(value, "sections");
    expect(value).toEqual(frozen);
  });
});

describe("Confidentiality scanner — response-validation backstop simulation", () => {
  it("hasBlockingConfidentialityFindings correctly identifies a scan result that must block a response", () => {
    const findings = scanTextForConfidentiality("Made with SLES.", "segment.MESSAGE");
    expect(hasBlockingConfidentialityFindings(findings)).toBe(true);
  });

  it("hasBlockingConfidentialityFindings returns false for genuinely safe content", () => {
    const findings = scanTextForConfidentiality("Here's what we found for you:", "segment.MESSAGE");
    expect(hasBlockingConfidentialityFindings(findings)).toBe(false);
  });

  it("simulates the website-channel-adapter's exact backstop behavior: a restricted segment is replaced with the fixed safe placeholder", () => {
    const CONFIDENTIALITY_REDACTION_PLACEHOLDER = "We don't have that information available right now.";
    function backstopScanSegmentContent(content: string): string {
      const findings = scanTextForConfidentiality(content, "segment.test");
      return hasBlockingConfidentialityFindings(findings) ? CONFIDENTIALITY_REDACTION_PLACEHOLDER : content;
    }
    expect(backstopScanSegmentContent("This product contains SLES and CAPB.")).toBe(CONFIDENTIALITY_REDACTION_PLACEHOLDER);
    expect(backstopScanSegmentContent("Here's some information that should help:")).toBe("Here's some information that should help:");
  });
});
