/**
 * MUV AI — Intelligence Reconciliation Mapper (Block 2A).
 *
 * Source normalization (Phase 4). Every function here is pure — no I/O,
 * no database access, no mutation of its input. Normalization must be
 * stable across repeated runs: the same raw input always produces the
 * same normalized output.
 */

export function normalizeWhitespace(text: string): string {
  return text
    .replace(/\r\n/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** Splits a "one bullet per line" text block (the convention already used
 * by `Product.benefits` and `ProductContent.keyBenefits`) into a clean
 * array — never invents a bullet that wasn't a real line in the source. */
export function splitBulletLines(text: string | null | undefined): string[] {
  if (!text) return [];
  return normalizeWhitespace(text)
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
}

export function normalizeSlug(slug: string): string {
  return slug.trim().toLowerCase();
}

export function normalizeProductName(name: string): string {
  return normalizeWhitespace(name);
}

export function normalizeCategoryName(name: string): string {
  return normalizeWhitespace(name);
}

/** `ProductVariant.size` values in this catalog are already consistent
 * ("1L", "500ml", "250ml") — normalization here only guards against
 * incidental whitespace/case drift, never reinterprets a real pack size. */
export function normalizePackSize(size: string): string {
  return size.trim();
}

/** Prices/MRPs are integers (paise-free, whole rupees) in this schema —
 * normalization is identity, kept as a named function so every commercial
 * value passes through one seam, matching the "never treat historical
 * prices as authoritative" discipline: this function only ever receives a
 * live `ProductVariant.price`/`.mrp`, never a `PublishedKnowledgeRecord`
 * value, enforced by which callers are allowed to invoke it (see
 * `sources.ts`). */
export function normalizePrice(value: number): number {
  return Math.round(value);
}

export function normalizeFragranceName(name: string | null | undefined): string | null {
  if (!name) return null;
  return normalizeWhitespace(name);
}

export function normalizeHeading(text: string): string {
  return normalizeWhitespace(text).replace(/\s+/g, " ");
}

export type NormalizedFaqEntry = { question: string; answer: string };

/** `ProductContent.faq` is stored as `Json`, shaped `{question,answer}[]`
 * at the application layer but not schema-enforced — this function is the
 * one place that validates the shape defensively before it's trusted
 * elsewhere in the mapper. Malformed entries are dropped, never guessed
 * into a shape. */
export function normalizeFaqStructure(raw: unknown): NormalizedFaqEntry[] {
  if (!Array.isArray(raw)) return [];
  const out: NormalizedFaqEntry[] = [];
  for (const entry of raw) {
    if (
      entry &&
      typeof entry === "object" &&
      typeof (entry as Record<string, unknown>).question === "string" &&
      typeof (entry as Record<string, unknown>).answer === "string"
    ) {
      out.push({
        question: normalizeHeading((entry as Record<string, unknown>).question as string),
        answer: normalizeWhitespace((entry as Record<string, unknown>).answer as string),
      });
    }
  }
  return out;
}

export function normalizeStringArray(values: string[] | null | undefined): string[] {
  if (!values) return [];
  return values.map((v) => normalizeWhitespace(v)).filter(Boolean);
}

/** `PublishedKnowledgeRecord.sourcePath` -> the Knowledge Factory product
 * family folder name, when the path matches the `products/<family>/`
 * convention discovered in Block 1. Returns null for non-product-family
 * paths (Constitution, Marketing/Institutional/Customer-Care/Founder
 * indexes) — never guessed. */
export function extractKfFamilyFromSourcePath(sourcePath: string): string | null {
  const match = sourcePath.match(/knowledge-factory\/products\/([^/]+)\//);
  return match?.[1] ?? null;
}

/** Source approval-status/version identifiers are preserved verbatim —
 * this function only trims incidental whitespace, never reclassifies a
 * status (that reclassification already happened once, upstream, in
 * `lib/runtime/knowledge-factory-loader.ts`'s `classifyApprovalTier()` —
 * this mapper must not re-run or second-guess that logic). */
export function normalizeApprovalStatusLabel(label: string): string {
  return label.trim();
}

export function normalizeVersionIdentifier(version: string | number): string {
  return String(version).trim();
}
