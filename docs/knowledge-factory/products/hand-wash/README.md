# MUV Hand Wash™ — Package Overview

> Product Family 11 of the MUV Product Knowledge Factory™. Category: **Personal Care.** First
> package built under `FR-005` (Safety Critical Product Classification) and the first package
> with a Founder-pre-verified, deliberately **asymmetric** Variant Availability Matrix.

---

## What makes this package structurally new

1. **First Personal Care category product this session** (Body Wash was Body Care — a related
   but distinct category).
2. **First package under `FR-005`** — Usage, Safety, Contraindications, First Aid, Storage, and
   Shelf Life are all mandatory documentation targets; every one of the six is either sourced or
   explicitly marked `Unknown — Founder Decision Required`. Unlike Body Wash (where the total
   safety-content gap was one general finding), FR-005 requires each field to be individually
   accounted for — see `08_Safety.md` and `03_Product_Intelligence.md` KO-HW-INTEL-003.
3. **First package with a genuinely asymmetric, Founder-pre-verified Variant Availability
   Matrix.** Four variants × three pack sizes = 12 theoretically possible combinations, but only
   **8 are real**:

   | Variant | 250ml | 500ml | 5L |
   |---|---|---|---|
   | Silk Blossom | ❌ | ✅ | ✅ |
   | Ocean Fresh | ❌ | ✅ | ✅ |
   | Citrus Blast | ✅ | ✅ | ❌ |
   | Life Shield | ✅ | ✅ | ❌ |

   This required a new architectural step, **Variant Availability Architecture** (execution step
   5), tracked as a distinct concern from **Variant Inheritance Architecture** (`FR-004`,
   execution step 6). See `02_Product_Architecture.md` KO-HW-AVAIL-001.
4. **A real, source-confirmed conflict between the Product Chart and the Founder's verified
   matrix**: the Chart is silent on Silk Blossom 5L (which the Founder confirms is real) and
   prices a Citrus Blast 5L row (historical citation only, see `00_Source_Register.md` §1) that
   the Founder says does not exist. The Founder's matrix
   governs which 8 SKUs this package builds Knowledge Objects for — consistent with the
   established Source Authority precedent (a direct, current Founder Instruction controls, as it
   did for Black Phenyl's pack-size decision) — but the underlying Chart discrepancy is left open
   and documented, never silently resolved. See `00_Source_Register.md` §1 and
   `14_FOUNDER_GAPS.md`.
5. **A real naming discrepancy inherited from the source SOP itself**: the SOP's own title is
   "MUV GLOW HAND WASH," not "MUV Hand Wash™," and it spells the fourth variant "Lifeshield" (one
   word), not "Life Shield" (two words, the Founder's official spelling). Both are treated as
   legacy/source naming, never presented as open conflicts requiring resolution — the Founder's
   names win, per the same pattern applied to every prior naming discrepancy this session.
   `lib/knowledge-factory/conflict-service.ts`'s own header comment already names "GLOW pricing
   and naming conflicts," independently corroborating this before this audit began.
6. **Zero sourced safety content, again** — the SOP has exactly four sections (Product Variants,
   Batch Formula, Production Process, Fragrance/Colour Guide) and nothing else. This is the same
   finding as Body Wash, but this time FR-005 (directly triggered by that finding) requires it to
   be documented field-by-field rather than as one general note.
7. **"Life Shield" is explicitly flagged, and explicitly not assumed to be antibacterial.**
   FR-005 itself names this exact risk. This package's own source audit (Product Chart, SOP,
   Knowledge Library, AI Sutra) found no claim, formulation difference, or positioning statement
   assigning any antibacterial, protective, or germ-killing property to Life Shield — its only
   documented differentiator from the other three variants is fragrance and colour (Pink). See
   `08_Safety.md` KO-HW-SAFETY-010.
8. **Two naming-adjacency conflicts found in `prisma/seed.ts`**, neither a match for any real
   Hand Wash variant: "MUV Silk Hair Wash" (a shampoo, superficially close to "Silk Blossom Hand
   Wash" by name) and "MUV Shield" (a car-care product, superficially close to "Life Shield" by
   name). Neither is used as a source here. See `00_Source_Register.md` §5.
9. **The SOP's own pricing table is generic, not variant-specific** (one flat price per pack
   size, regardless of variant), while the Product Chart prices each variant/pack-size
   combination individually and differently. Since neither figure is ever stored as commercial
   data in this package anyway (`FR-001`), this conflict is recorded only as a historical citation
   note in `00_Source_Register.md`, not resolved.

## Knowledge Reuse

Per `FR-003`, this package compares against all ten prior packages before authoring new content,
with Body Wash (the only other package built under `FR-004`) and Floor Cleaner (the original
Variant Inheritance precedent) given particular weight, plus Body Wash's own Safety Risk Flag
methodology for how to report a severe, category-defining content gap honestly. Full accounting
in `13_Reports/10_Knowledge_Reuse_Summary.md`.

## Commercial Data

No MRP, selling price, discount, images, stock, availability, URL, slug, or marketplace pricing
is stored anywhere in this package. All resolve live via `10_LIVE_DATA_MAPPING.md`. Historical
Chart/SOP figures found during source research are recorded, labeled as historical citations
only, in `00_Source_Register.md`.

## Stop Rule

Per the Founder's explicit instruction: **STOP** after this package is complete. Do not begin
Product Family 12 without explicit Founder approval.
