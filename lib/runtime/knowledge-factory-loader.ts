import fs from "node:fs";
import path from "node:path";
import { logger } from "@/lib/logger";
import type { KnowledgeFactoryRecord, KnowledgeFactorySourceType, KOApprovalTier } from "./types";

/**
 * MUV AI — Stage 6D/8, Knowledge Factory Integration. Real, file-backed
 * retrieval for the 5 completed, frozen Knowledge Factories
 * (`docs/knowledge-factory`, `docs/marketing-knowledge-factory`,
 * `docs/institutional-sales-knowledge-factory`,
 * `docs/founder-intelligence-knowledge-factory`, and — added Stage 8 —
 * `docs/customer-care-knowledge-factory`). Never regenerates, rewrites, or
 * duplicates repository content — this module only ever reads real files
 * from disk and parses them into an in-memory index.
 *
 * FORMAT: every one of the 4 Knowledge Factories, in every real source
 * file sampled during this stage's recon (Product KF's per-product
 * `NN_Section.md` files, Marketing KF's per-chapter
 * `03_knowledge_objects.md` files, Institutional Sales / Founder
 * Intelligence's single `KNOWLEDGE_OBJECTS.md` files), uses the same
 * structural pattern:
 *
 *   ## KO-XXX-001 — Some Title
 *   - **Field Name:** value (may continue on indented following lines)
 *   - **Another Field:** value
 *   **Content:**
 *   <real body text, until the next "## KO-" header or end of file>
 *
 * The two KO "families" in this codebase use different field *names* for
 * related concepts (Product KF: KOID/Title/Category/Tags/Version/
 * Confidence/Evidence/Relationships/Owner/Approval Status/Review Date/
 * Source; Marketing/Institutional Sales/Founder Intelligence KF: Name or
 * Purpose/Scope/Inputs/Outputs/Dependencies/Relationships/Governance
 * Rules/Validation Rules/Version/Status/Change History/Evidence
 * Classification) — this parser does not force either into a rigid
 * schema. It captures every field generically into `fields`, and only
 * normalizes the 2 fields every runtime module actually needs
 * structurally: `relationships` (KOID cross-references) and
 * `approvalTier` (derived from whichever of "Approval Status"/"Status" is
 * present).
 *
 * The corresponding `*.json` manifest/knowledge_objects.json files next to
 * these markdown files are NOT parsed here — they are summary indexes
 * (koid/title/tags/relationships) without the real KO body content, so the
 * markdown is the actual source of truth for retrievable text. Reading
 * them was part of this stage's recon, not a source this loader depends on.
 */

const KF_ROOTS: { dir: string; domainFactory: KnowledgeFactorySourceType }[] = [
  { dir: "docs/knowledge-factory", domainFactory: "PRODUCT_KF" },
  { dir: "docs/marketing-knowledge-factory", domainFactory: "MARKETING_KF" },
  { dir: "docs/institutional-sales-knowledge-factory", domainFactory: "INSTITUTIONAL_SALES_KF" },
  { dir: "docs/founder-intelligence-knowledge-factory", domainFactory: "FOUNDER_INTELLIGENCE_KF" },
  // Stage 8 — Customer Care Knowledge Factory. Almost entirely
  // Citation-only KOs pointing back into the other 4 factories (see its
  // own CUSTOMER_CARE_MASTER.md) — this loader treats it identically to
  // the other 4 roots; nothing special-cased here for citation-only
  // content, since a citation-only KO's real, retrievable text (which
  // repository/KOID it points to) IS its content, not a placeholder.
  { dir: "docs/customer-care-knowledge-factory", domainFactory: "CUSTOMER_CARE_KF" },
];

const KO_HEADER_RE = /^##\s+(KO-[A-Za-z0-9-]+)\s*[—-]\s*(.+)$/gm;
const FIELD_LINE_RE = /^-\s+\*\*([^:*]+):\*\*\s*(.*)$/;
// Permissive on purpose: real files use both "**Content:**" and
// "**Content — Figure 2.1 — Sales Journey Framework:**" (a descriptive
// suffix before the colon) — found during this stage's own verification
// when KO-IS-001's real content came back empty against the stricter
// "**Content:**"-only pattern that was here originally.
const CONTENT_MARKER_RE = /\*\*Content[^*\n]*:\*\*\s*/;
const KOID_TOKEN_RE = /KO-[A-Za-z0-9-]+/g;
/** `FOUNDER_CONSTITUTION.md`'s own format — "## Article N — Title" followed
 * directly by body text, no metadata block. Handled as a second, separate
 * pass (not a variant of the KO pattern above) since it is structurally
 * different, real, and — per the Constitution's own header — the single
 * highest-authority document in the Founder Intelligence Knowledge
 * Factory ("Founder Decisions → this Constitution → the ten Engines").
 * Never skip indexing it just because it doesn't use the KOID format. */
const ARTICLE_HEADER_RE = /^##\s+Article\s+(\d+)\s*[—-]\s*(.+)$/gm;

function walkMarkdownFiles(rootDir: string): string[] {
  const results: string[] = [];
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(rootDir, { withFileTypes: true });
  } catch {
    return results; // Directory absent — reported by the loader's summary, not thrown here.
  }
  for (const entry of entries) {
    const full = path.join(rootDir, entry.name);
    if (entry.isDirectory()) {
      results.push(...walkMarkdownFiles(full));
    } else if (entry.isFile() && entry.name.toLowerCase().endsWith(".md")) {
      results.push(full);
    }
  }
  return results;
}

function classifyApprovalTier(statusText: string | undefined): KOApprovalTier {
  if (!statusText) return "UNKNOWN";
  const t = statusText.toLowerCase();
  if (t.includes("approved") && !t.includes("pending")) return "APPROVED";
  if (t.includes("founder review ready")) return "REVIEW_READY";
  if (t.includes("draft")) return "DRAFT";
  if (t.includes("open")) return "OPEN_PENDING_FOUNDER_INPUT";
  return "UNKNOWN";
}

/** Stable, collision-resistant prefix derived from the real filename — NOT
 * a fixed "FC-" constant. Found during this stage's own verification:
 * `docs/knowledge-factory/CONSTITUTION.md` (the Product Knowledge
 * Factory's own constitution) ALSO uses "## Article N — Title" headers,
 * completely independently of `docs/founder-intelligence-knowledge-factory
 * /FOUNDER_CONSTITUTION.md` — a fixed "FC-ARTICLE-1" id for both silently
 * collided, and `Array.find()` returned whichever file the directory walk
 * reached first (Product KF, since it sorts first in `KF_ROOTS`), silently
 * shadowing the Founder Constitution's real Article 1 with an unrelated
 * document under the same id. Namespacing by filename makes every
 * Constitution's Articles independently addressable and preserves
 * "repository boundaries" as this stage requires. */
function articleFileTag(filePath: string): string {
  return path
    .basename(filePath, ".md")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function parseArticleSections(text: string, filePath: string, domainFactory: KnowledgeFactorySourceType): KnowledgeFactoryRecord[] {
  const headers: { num: string; title: string; index: number }[] = [];
  let m: RegExpExecArray | null;
  ARTICLE_HEADER_RE.lastIndex = 0;
  while ((m = ARTICLE_HEADER_RE.exec(text)) !== null) {
    headers.push({ num: m[1]!, title: m[2]!.trim(), index: m.index });
  }
  if (headers.length === 0) return [];

  const fileTag = articleFileTag(filePath);

  return headers.map((h, i) => {
    const start = h.index;
    const end = i + 1 < headers.length ? headers[i + 1]!.index : text.length;
    const content = text
      .slice(start, end)
      .split("\n")
      .slice(1)
      .join("\n")
      .trim()
      .replace(/\n---\s*$/, "")
      .trim();
    const relationships = [...new Set([...content.matchAll(KOID_TOKEN_RE)].map((r) => r[0]))];

    return {
      koid: `${fileTag}-ARTICLE-${h.num}`,
      title: h.title,
      domainFactory,
      category: `Constitution (${fileTag})`,
      content,
      fields: { Version: "1.0" },
      relationships,
      // Every real "## Article" document sampled in this codebase declares
      // itself binding/supreme within its own repository — real, not
      // inferred (see each file's own header block).
      approvalTier: "APPROVED" as const,
      isGapRecord: false,
      sourceFile: filePath,
    };
  });
}

function parseFile(filePath: string, domainFactory: KnowledgeFactorySourceType): KnowledgeFactoryRecord[] {
  let text: string;
  try {
    text = fs.readFileSync(filePath, "utf-8");
  } catch (err) {
    logger.error("runtime:kf-loader:read-failed", { filePath, error: err instanceof Error ? err.message : String(err) });
    return [];
  }

  const headers: { koid: string; title: string; index: number }[] = [];
  let m: RegExpExecArray | null;
  KO_HEADER_RE.lastIndex = 0;
  while ((m = KO_HEADER_RE.exec(text)) !== null) {
    headers.push({ koid: m[1]!, title: m[2]!.trim(), index: m.index });
  }

  const records: KnowledgeFactoryRecord[] = [];

  if (headers.length === 0) {
    return parseArticleSections(text, filePath, domainFactory);
  }
  records.push(...parseArticleSections(text, filePath, domainFactory));
  for (let i = 0; i < headers.length; i++) {
    const start = headers[i]!.index;
    const end = i + 1 < headers.length ? headers[i + 1]!.index : text.length;
    const section = text.slice(start, end);

    const contentMatch = CONTENT_MARKER_RE.exec(section);
    const metaBlock = contentMatch ? section.slice(0, contentMatch.index) : section;
    const content = contentMatch ? section.slice(contentMatch.index + contentMatch[0].length).trim().replace(/\n---\s*$/, "").trim() : "";

    const fields: Record<string, string> = {};
    let currentField: string | null = null;
    for (const rawLine of metaBlock.split("\n").slice(1)) {
      const line = rawLine.trim();
      if (!line) continue;
      const fieldMatch = FIELD_LINE_RE.exec(rawLine);
      if (fieldMatch) {
        currentField = fieldMatch[1]!.trim();
        fields[currentField] = fieldMatch[2]!.trim();
      } else if (currentField && !line.startsWith("##")) {
        fields[currentField] = `${fields[currentField]} ${line}`.trim();
      }
    }

    const statusText = fields["Approval Status"] ?? fields["Status"];
    const relationshipsText = fields["Relationships"] ?? "";
    const relationships = [...new Set([...relationshipsText.matchAll(KOID_TOKEN_RE)].map((r) => r[0]))];

    const scopeOrCategory = fields["Category"] ?? fields["Scope"] ?? null;
    // Prefer the metadata block's own "**Title:**" field over the bare
    // "## KOID — ..." header text when present — found during this stage's
    // own verification that the header text alone is often a short
    // section label ("Ingredient List with Generic Functional Context")
    // while the real, product-qualified name ("MUV Dishwash Gel™ —
    // Ingredient List & Generic Functional Roles") only lives in the
    // Title field. Falls back to the header text for KO formats that have
    // no separate Title field (Marketing/Institutional/Founder KF, whose
    // header text already IS the full name).
    const resolvedTitle = fields["Title"] ?? fields["Name"] ?? headers[i]!.title;
    const titleLower = headers[i]!.title.toLowerCase();
    const scopeLower = (fields["Scope"] ?? "").toLowerCase();
    const isGapRecord = titleLower.includes("gap record") || scopeLower.includes("gap record only") || scopeLower.includes("no content");

    records.push({
      koid: headers[i]!.koid,
      title: resolvedTitle,
      domainFactory,
      category: scopeOrCategory,
      content,
      fields,
      relationships,
      approvalTier: classifyApprovalTier(statusText),
      isGapRecord,
      sourceFile: filePath,
    });
  }
  return records;
}

let cachedIndex: KnowledgeFactoryRecord[] | null = null;
let cachedSummary: { domainFactory: KnowledgeFactorySourceType; fileCount: number; koCount: number }[] | null = null;

/** Lazy, in-process singleton — built once per process from real files on
 * disk, same "prefer computation over storage" convention this codebase's
 * feature-flag manager already established. A server restart naturally
 * re-reads any future content change; there is no explicit invalidation
 * because these repositories are declared frozen for this stage. */
export function getKnowledgeFactoryIndex(): KnowledgeFactoryRecord[] {
  if (cachedIndex) return cachedIndex;

  const index: KnowledgeFactoryRecord[] = [];
  const summary: { domainFactory: KnowledgeFactorySourceType; fileCount: number; koCount: number }[] = [];

  for (const { dir, domainFactory } of KF_ROOTS) {
    const absoluteDir = path.join(process.cwd(), dir);
    const files = walkMarkdownFiles(absoluteDir);
    let koCount = 0;
    for (const file of files) {
      const records = parseFile(file, domainFactory);
      koCount += records.length;
      index.push(...records);
    }
    summary.push({ domainFactory, fileCount: files.length, koCount });
  }

  cachedIndex = index;
  cachedSummary = summary;
  return index;
}

/** Real load-summary (files scanned, KOs parsed per factory) — used by
 * `KNOWLEDGE_INTEGRATION_REPORT.md`'s verification script and by
 * `actions/runtime.ts` for staff-facing diagnostics. Never fabricated:
 * calling this before any retrieval forces the index to build first. */
export function getKnowledgeFactoryLoadSummary(): { domainFactory: KnowledgeFactorySourceType; fileCount: number; koCount: number }[] {
  if (!cachedSummary) getKnowledgeFactoryIndex();
  return cachedSummary!;
}
