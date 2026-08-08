/**
 * MUV AI — Content-Aware Confidentiality Scanner (Corrective Hardening).
 *
 * Origin: the independent Founder audit (`MUV_AI_INDEPENDENT_FOUNDER_AUDIT_REPORT.md`,
 * §10/§22, Finding H1) found that the existing `CONFIDENTIAL_CONTENT_PRESENT`
 * governance rule (`governance-validation.ts`) only checks
 * `Boolean(projection.sections.ingredients)` — a single dedicated field —
 * and does not scan any other free-text field for embedded raw-material/
 * formulation identifiers. Real raw-material abbreviations (SLES/CAPB/CDEA)
 * were found inside `productIdentity`, a field with no such check.
 *
 * This module is the single, centralized, deterministic scanner every
 * integration point (governance validation, population writer, retrieval,
 * response validation) must call — no ad hoc string checks may be
 * duplicated elsewhere. Pure and read-only: it never mutates its input,
 * never deletes or rewrites matched text, only reports structured findings.
 *
 * "Do not assume every ingredient name is automatically confidential" —
 * this scanner distinguishes a known-restricted internal-formulation term
 * from a known public-label ingredient (safe only when the caller supplies
 * evidence the source is Founder-approved) from an unrecognized/ambiguous
 * chemical-sounding term (always routed to Founder review, never silently
 * approved or silently rejected).
 */

export type ConfidentialityCategory =
  | "RAW_MATERIAL_ABBREVIATION"
  | "RAW_MATERIAL_FULL_NAME"
  | "FORMULA_PERCENTAGE"
  | "BATCH_QUANTITY"
  | "PROCESS_TEMPERATURE"
  | "MANUFACTURING_SEQUENCE"
  | "SUPPLIER_GRADE_IDENTIFIER"
  | "PROPRIETARY_FORMULATION_COMBINATION";

export type ConfidentialityClassification =
  | "RESTRICTED_INTERNAL_FORMULATION"
  | "PUBLIC_LABEL_INGREDIENT"
  | "FOUNDER_REVIEW_REQUIRED"
  | "SAFE_PUBLIC_LANGUAGE";

export type ConfidentialitySeverity = "CRITICAL" | "HIGH" | "MEDIUM" | "LOW";

export type ConfidentialityFinding = {
  category: ConfidentialityCategory;
  classification: ConfidentialityClassification;
  normalizedTerm: string;
  originalMatch: string;
  fieldPath: string;
  severity: ConfidentialitySeverity;
  sourceReference: string | null;
  recommendedAction: string;
  reviewRequired: boolean;
};

export type ConfidentialityScanContext = {
  /** Identifies the record/version being scanned, for evidence trails —
   * never used to suppress a finding. */
  sourceReference?: string | null;
  /** Whether the caller has explicit evidence this content's source is
   * Founder-approved for public disclosure — the ONLY thing that can
   * downgrade a PUBLIC_LABEL_INGREDIENT match to SAFE rather than
   * FOUNDER_REVIEW_REQUIRED. Never inferred; must be supplied explicitly. */
  sourceApprovalStatus?: "APPROVED" | "PENDING" | "UNKNOWN";
};

type VocabEntry = { normalizedTerm: string; aliases: string[]; category: ConfidentialityCategory };

const RESTRICTED_INTERNAL_FORMULATION_VOCAB: VocabEntry[] = [
  { normalizedTerm: "SLES", aliases: ["SLES", "S.L.E.S.", "S L E S", "Sodium Laureth Sulfate"], category: "RAW_MATERIAL_ABBREVIATION" },
  { normalizedTerm: "CAPB", aliases: ["CAPB", "C.A.P.B.", "C A P B", "Cocamidopropyl Betaine"], category: "RAW_MATERIAL_ABBREVIATION" },
  { normalizedTerm: "CDEA", aliases: ["CDEA", "C.D.E.A.", "C D E A", "Cocamide DEA", "Cocamide Diethanolamine"], category: "RAW_MATERIAL_ABBREVIATION" },
];

/** Common personal-care-industry label ingredients — frequently disclosed
 * openly on real product packaging, but this scanner NEVER treats that
 * industry norm as automatic approval; see ConfidentialityScanContext. */
const PUBLIC_LABEL_INGREDIENT_VOCAB: VocabEntry[] = [
  { normalizedTerm: "Glycerin", aliases: ["Glycerin", "Glycerine", "Glycerol"], category: "RAW_MATERIAL_FULL_NAME" },
  { normalizedTerm: "Citric Acid", aliases: ["Citric Acid"], category: "RAW_MATERIAL_FULL_NAME" },
  { normalizedTerm: "Aqua", aliases: ["Aqua"], category: "RAW_MATERIAL_FULL_NAME" },
  { normalizedTerm: "Sodium Chloride", aliases: ["Sodium Chloride"], category: "RAW_MATERIAL_FULL_NAME" },
];

/** Builds ONE pattern per alias that matches both its punctuated form
 * ("S.L.E.S.") and its bare form ("SLES") — separators between the
 * alias's own letters/words become optional (`*`), never mandatory, so a
 * single pattern covers every spacing/punctuation/case variant without
 * needing a second normalization pass (which previously caused every
 * match to be double-counted whenever normalization was a no-op — the
 * common case for plain unpunctuated text). */
function aliasToPattern(alias: string): RegExp {
  // A trailing period on an abbreviation-style alias ("S.L.E.S.") is
  // stylistic, not a separator between letters — converting it into a
  // trailing flexible-separator class would let the pattern greedily
  // consume unrelated adjacent punctuation in real text (e.g. matching
  // "CDEA-" instead of "CDEA" in "CDEA-based"). Stripped before building
  // the pattern; internal separators are still fully flexible.
  const trimmed = alias.replace(/\.+$/, "");
  const escaped = trimmed.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const flexible = escaped.replace(/\\?[.\s]+/g, "[\\.\\s-]*");
  return new RegExp(`\\b${flexible}\\b`, "gi");
}

type PositionedMatch = { start: number; end: number; normalizedTerm: string; originalMatch: string; category: ConfidentialityCategory };

/** Per normalized term, several aliases can legitimately overlap the same
 * span (e.g. both the "SLES" alias and the now-flexible "S.L.E.S." alias
 * match plain "SLES"). This keeps only one, longest, non-overlapping
 * match per term per span — real distinct occurrences elsewhere in the
 * same text are still each counted once. */
function dedupeOverlapping(matches: PositionedMatch[]): PositionedMatch[] {
  const byTerm = new Map<string, PositionedMatch[]>();
  for (const m of matches) {
    const list = byTerm.get(m.normalizedTerm) ?? [];
    list.push(m);
    byTerm.set(m.normalizedTerm, list);
  }
  const result: PositionedMatch[] = [];
  for (const list of byTerm.values()) {
    list.sort((a, b) => a.start - b.start || b.end - a.end);
    let lastEnd = -1;
    for (const m of list) {
      if (m.start >= lastEnd) {
        result.push(m);
        lastEnd = m.end;
      }
    }
  }
  return result;
}

function findVocabMatches(text: string, vocab: VocabEntry[]): { normalizedTerm: string; originalMatch: string; category: ConfidentialityCategory }[] {
  const positioned: PositionedMatch[] = [];
  for (const entry of vocab) {
    for (const alias of entry.aliases) {
      const pattern = aliasToPattern(alias);
      let match: RegExpExecArray | null;
      pattern.lastIndex = 0;
      while ((match = pattern.exec(text))) {
        positioned.push({ start: match.index, end: match.index + match[0].length, normalizedTerm: entry.normalizedTerm, originalMatch: match[0], category: entry.category });
        if (match[0].length === 0) pattern.lastIndex++;
      }
    }
  }
  return dedupeOverlapping(positioned).map(({ normalizedTerm, originalMatch, category }) => ({ normalizedTerm, originalMatch, category }));
}

// --- Generic pattern-based categories -------------------------------------

const FORMULA_PERCENTAGE_PATTERN = /\b\d{1,3}(?:\.\d+)?\s?%/g;
const BATCH_QUANTITY_PATTERN = /\b\d+(?:\.\d+)?\s?(?:kg|kilograms?|litres?|liters?|l|ml|grams?|g)\s?(?:\/|\s)?(?:batch|per\s+batch|production\s+batch)\b/gi;
const PROCESS_TEMPERATURE_PATTERN = /\b\d{1,3}\s?°?\s?(?:c|f|celsius|fahrenheit)\b/gi;
const MANUFACTURING_SEQUENCE_PATTERN = /\b(?:process\s+step|pearl\s+paste\s+step|mixing\s+sequence|manufacturing\s+process|production\s+process|SOP\s*§|raw[\s-]?material\s+list|raw[\s-]?material\s+quantit(?:y|ies))\b/gi;
const SUPPLIER_GRADE_PATTERN = /\bgrade[\s-][A-Za-z0-9-]+\b|\bCAS[\s-]?\d{2,7}-\d{2}-\d\b/gi;

function scanGenericPatterns(text: string): { category: ConfidentialityCategory; originalMatch: string }[] {
  const results: { category: ConfidentialityCategory; originalMatch: string }[] = [];
  const patterns: [ConfidentialityCategory, RegExp][] = [
    ["FORMULA_PERCENTAGE", FORMULA_PERCENTAGE_PATTERN],
    ["BATCH_QUANTITY", BATCH_QUANTITY_PATTERN],
    ["PROCESS_TEMPERATURE", PROCESS_TEMPERATURE_PATTERN],
    ["MANUFACTURING_SEQUENCE", MANUFACTURING_SEQUENCE_PATTERN],
    ["SUPPLIER_GRADE_IDENTIFIER", SUPPLIER_GRADE_PATTERN],
  ];
  for (const [category, pattern] of patterns) {
    pattern.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(text))) {
      results.push({ category, originalMatch: match[0] });
    }
  }
  return results;
}

/** Scans a single string leaf value and returns every finding at that
 * field path — the core, reusable unit every recursive/array/object
 * walker below is built from. */
export function scanTextForConfidentiality(text: string, fieldPath: string, context: ConfidentialityScanContext = {}): ConfidentialityFinding[] {
  if (!text || typeof text !== "string") return [];
  const findings: ConfidentialityFinding[] = [];
  const sourceReference = context.sourceReference ?? null;

  const restrictedMatches = findVocabMatches(text, RESTRICTED_INTERNAL_FORMULATION_VOCAB);
  for (const m of restrictedMatches) {
    findings.push({
      category: m.category,
      classification: "RESTRICTED_INTERNAL_FORMULATION",
      normalizedTerm: m.normalizedTerm,
      originalMatch: m.originalMatch,
      fieldPath,
      severity: "CRITICAL",
      sourceReference,
      recommendedAction: "Remove or relocate to a Founder-review-only, never-customer-safe internal record. Never permit this projection to become CUSTOMER_SAFE/PUBLIC while this term remains.",
      reviewRequired: true,
    });
  }
  // Proprietary formulation combination: 2+ distinct restricted terms in
  // the same field value (e.g. "SLES/CAPB/CDEA") is itself a stronger,
  // separately-reportable signal than any one term alone.
  const distinctRestrictedTerms = new Set(restrictedMatches.map((m) => m.normalizedTerm));
  if (distinctRestrictedTerms.size >= 2) {
    findings.push({
      category: "PROPRIETARY_FORMULATION_COMBINATION",
      classification: "RESTRICTED_INTERNAL_FORMULATION",
      normalizedTerm: [...distinctRestrictedTerms].sort().join("+"),
      originalMatch: text.length > 160 ? text.slice(0, 160) + "…" : text,
      fieldPath,
      severity: "CRITICAL",
      sourceReference,
      recommendedAction: "Multiple restricted raw-material identifiers co-occur — this is a formulation combination signature, treat as maximally sensitive.",
      reviewRequired: true,
    });
  }

  const publicLabelMatches = findVocabMatches(text, PUBLIC_LABEL_INGREDIENT_VOCAB);
  const sourceApproved = context.sourceApprovalStatus === "APPROVED";
  for (const m of publicLabelMatches) {
    findings.push({
      category: m.category,
      classification: sourceApproved ? "PUBLIC_LABEL_INGREDIENT" : "FOUNDER_REVIEW_REQUIRED",
      normalizedTerm: m.normalizedTerm,
      originalMatch: m.originalMatch,
      fieldPath,
      severity: sourceApproved ? "LOW" : "MEDIUM",
      sourceReference,
      recommendedAction: sourceApproved
        ? "Common label ingredient with an explicitly Founder-approved source — safe to retain."
        : "Common label ingredient, but no explicit Founder-approved source evidence was supplied — route to Founder review before treating as safe public language.",
      reviewRequired: !sourceApproved,
    });
  }

  const genericMatches = scanGenericPatterns(text);
  for (const m of genericMatches) {
    findings.push({
      category: m.category,
      classification: "FOUNDER_REVIEW_REQUIRED",
      normalizedTerm: m.category,
      originalMatch: m.originalMatch,
      fieldPath,
      severity: "MEDIUM",
      sourceReference,
      recommendedAction: `Pattern matching ${m.category.toLowerCase().replace(/_/g, " ")} found — ambiguous without Founder context; route to Founder review rather than auto-approve or auto-reject.`,
      reviewRequired: true,
    });
  }

  return findings;
}

/** Recursively walks any JSON-shaped value (objects, arrays, nested
 * structures — "sections in a projection," "a FAQ array," "metadata
 * blobs") and scans every string leaf, building a dotted/bracketed
 * fieldPath as it goes (e.g. "sections.faqs[2].answer"). This is the one
 * function every integration point should call — no other file should
 * re-implement a recursive-walk-plus-string-check. */
export function scanValueForConfidentiality(value: unknown, basePath: string, context: ConfidentialityScanContext = {}): ConfidentialityFinding[] {
  const findings: ConfidentialityFinding[] = [];
  const visit = (node: unknown, path: string) => {
    if (node === null || node === undefined) return;
    if (typeof node === "string") {
      findings.push(...scanTextForConfidentiality(node, path, context));
      return;
    }
    if (Array.isArray(node)) {
      node.forEach((item, i) => visit(item, `${path}[${i}]`));
      return;
    }
    if (typeof node === "object") {
      for (const key of Object.keys(node as Record<string, unknown>)) {
        visit((node as Record<string, unknown>)[key], path ? `${path}.${key}` : key);
      }
    }
  };
  visit(value, basePath);
  return findings;
}

const REDACTION_PLACEHOLDER = "[REDACTED: internal formulation reference — see confidentiality scan evidence]";

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Redacts ONLY high-confidence `RESTRICTED_INTERNAL_FORMULATION` vocabulary
 * matches (the known raw-material abbreviations/full names — never the
 * ambiguous pattern-based categories like batch quantities or supplier
 * grades, which require actual Founder judgment and must never be
 * silently mangled by a keyword scanner). Returns the redacted text
 * alongside the findings that triggered each redaction, so a caller can
 * record exactly what was removed and why — "do not silently delete,
 * rewrite, or sanitize restricted information without recording why."
 */
export function redactTextForConfidentiality(text: string, fieldPath: string, context: ConfidentialityScanContext = {}): { text: string; redactions: ConfidentialityFinding[] } {
  if (!text || typeof text !== "string") return { text, redactions: [] };
  const findings = scanTextForConfidentiality(text, fieldPath, context);
  const toRedact = findings.filter((f) => f.classification === "RESTRICTED_INTERNAL_FORMULATION" && f.category !== "PROPRIETARY_FORMULATION_COMBINATION");
  if (toRedact.length === 0) return { text, redactions: [] };

  let redacted = text;
  // Longest-match-first avoids a shorter term's replacement corrupting a
  // longer overlapping match still pending (e.g. redact "Cocamide DEA"
  // before any shorter substring of it).
  const uniqueMatches = [...new Set(toRedact.map((f) => f.originalMatch))].sort((a, b) => b.length - a.length);
  for (const match of uniqueMatches) {
    redacted = redacted.split(match).join(REDACTION_PLACEHOLDER);
  }
  // Collapse a run of adjacent placeholders (e.g. "SLES/CAPB/CDEA-based"
  // redacting to three back-to-back placeholders joined by "/") into one
  // — the individual terms are gone; there is no remaining benefit to
  // repeating the same placeholder three times, only reduced readability.
  const placeholderRun = new RegExp(`(?:${escapeRegExp(REDACTION_PLACEHOLDER)}[\\s/,-]*){2,}`, "g");
  redacted = redacted.replace(placeholderRun, REDACTION_PLACEHOLDER + " ");
  // A single (non-collapsed) placeholder can still directly abut a word
  // character if the original match had a trailing hyphen with nothing
  // else after it (e.g. "CDEA-based" with only one redacted term) —
  // ensure a space always separates the placeholder from following text.
  redacted = redacted.replace(new RegExp(`${escapeRegExp(REDACTION_PLACEHOLDER)}(?=[A-Za-z0-9])`, "g"), REDACTION_PLACEHOLDER + " ");
  return { text: redacted, redactions: toRedact };
}

/** Recursively walks any JSON-shaped value and applies
 * `redactTextForConfidentiality` to every string leaf, returning both the
 * redacted value (same shape as the input) and the flat list of every
 * redaction applied anywhere within it — the write-time counterpart to
 * `scanValueForConfidentiality`. */
export function redactValueForConfidentiality<T>(value: T, basePath: string, context: ConfidentialityScanContext = {}): { value: T; redactions: ConfidentialityFinding[] } {
  const allRedactions: ConfidentialityFinding[] = [];
  const visit = (node: unknown, path: string): unknown => {
    if (node === null || node === undefined) return node;
    if (typeof node === "string") {
      const { text, redactions } = redactTextForConfidentiality(node, path, context);
      allRedactions.push(...redactions);
      return text;
    }
    if (Array.isArray(node)) {
      return node.map((item, i) => visit(item, `${path}[${i}]`));
    }
    if (typeof node === "object") {
      const out: Record<string, unknown> = {};
      for (const key of Object.keys(node as Record<string, unknown>)) {
        out[key] = visit((node as Record<string, unknown>)[key], path ? `${path}.${key}` : key);
      }
      return out;
    }
    return node;
  };
  return { value: visit(value, basePath) as T, redactions: allRedactions };
}

/** Convenience summary used by every downstream gate: does this set of
 * findings contain anything that must block CUSTOMER_SAFE/PUBLIC
 * eligibility right now? Every RESTRICTED_INTERNAL_FORMULATION and every
 * FOUNDER_REVIEW_REQUIRED finding blocks — only SAFE_PUBLIC_LANGUAGE (the
 * ambient absence of a finding) and an explicitly-approved
 * PUBLIC_LABEL_INGREDIENT do not. */
export function hasBlockingConfidentialityFindings(findings: ConfidentialityFinding[]): boolean {
  return findings.some((f) => f.classification === "RESTRICTED_INTERNAL_FORMULATION" || f.classification === "FOUNDER_REVIEW_REQUIRED");
}
