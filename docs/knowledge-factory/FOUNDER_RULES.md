# MUV Product Knowledge Factory™ — Founder Rules Ledger

> A dated, append-only ledger of binding Founder Decisions governing the Product Knowledge
> Factory. Each entry is permanent once recorded — a later decision may supersede an earlier one,
> but the earlier entry is never deleted, matching the "never silently resolve/never silently
> edit" discipline used everywhere else in this system. `CONSTITUTION.md`, `ARCHITECTURE.md`, and
> `VALIDATION_RULES.md` are the living documents that implement whatever this ledger currently
> says; this ledger is the source of truth for *that a decision was made*, not the full
> implementation detail.

---

## FR-001 — Commercial / Knowledge Separation

- **Date:** 2026-07-31
- **Status:** BINDING, permanent, in effect
- **Decided by:** Founder
- **Scope:** All present and future Product Knowledge Factory work — every Product Knowledge
  Package, every Knowledge Object, all six already-built packages' forward maintenance, and every
  future product family.

**Decision (as given):**

> "The Product Knowledge Factory must NEVER hardcode product MRP, selling price, product images,
> stock status, or packaging visuals. These values must always be fetched dynamically from the
> live MUV website product catalog (CMS/database). AI should use the Product Knowledge Factory
> only for: Product knowledge, Usage guidance, FAQs, Safety, SOPs, Decision Trees, Care
> Intelligence, Product comparison, Recommendations. For the following fields, AI must always
> read the current website data: Product Name, Product Images, MRP, Selling Price, Discount,
> Available Pack Sizes, Active Variants, Stock Status, Product URL, Product Slug, Product
> Availability. If the website product data changes, AI must automatically use the updated values
> without requiring any Product Knowledge update. The website product catalog is the single
> source of truth for commercial information. The Product Knowledge Factory remains the single
> source of truth for product intelligence. ... Never duplicate commercial data inside the
> Knowledge Factory."

**Implemented in:**
- `CONSTITUTION.md` Articles 1–4 (the binding rule itself, its scope, and its rationale)
- `ARCHITECTURE.md` (how retrieval must merge live commercial data with static knowledge content)
- `VALIDATION_RULES.md` (the enforceable checklist and the legacy compliance register for the
  six pre-existing packages)

**Superseded in part by `FR-002` below**, which resolves the open remediation question this entry
originally left pending.

---

## FR-002 — Full Remediation Pass (Option 2) Across All Existing Product Families

- **Date:** 2026-07-31
- **Status:** BINDING, executed. All six packages remediated 2026-07-31; full account in
  `LEGACY_REMEDIATION_REPORT.md`
- **Decided by:** Founder
- **Scope:** All six Product Knowledge Packages that predate `FR-001`/`CONSTITUTION.md`
  (Liquid Detergent, Toilet Cleaner, Dishwash Gel, Bathroom Cleaner, Glass Cleaner, Floor
  Cleaner). Resolves `VALIDATION_RULES.md` §5.1's open choice between the two remediation paths
  in favor of Option 2 (Full Remediation Pass).

**Decision (as given):**

> "Proceed with Option 2 (Full Remediation Pass). Apply FR-001 and FR-002 across the entire
> Product Knowledge Factory. For every existing Product Family: 1. Remove all hardcoded commercial
> information. 2. Remove hardcoded: MRP, Selling Price, Discount, Stock, Availability, Product
> Images, URLs, Slugs, Marketplace pricing. 3. Replace them with dynamic references to the live
> Product API/CMS. 4. Create LIVE_DATA_MAPPING.md inside every Product Family documenting the
> authoritative source for every commercial field. 5. Add a Validation Check confirming that no
> commercial data is stored in the Knowledge Package. 6. Update MASTER documents and Validation
> Reports. 7. Revalidate all previously frozen Product Families. Do not modify any product
> intelligence, SOPs, safety guidance, FAQs, decision trees, Care Intelligence, or Founder Rules.
> Only commercial data handling is being remediated."

**Binding interpretation of scope (applied consistently across all six packages):**
- "Commercial data" removed from every customer/AI-facing file means: MRP, selling price,
  discount, stock/availability status, product image references presented as live assets, product
  URLs, slugs, and any marketplace/institutional pricing figure presented as usable.
- Historical `00_Source_Register.md` and Source Conflict Register entries are the one exception:
  their ₹ figures are retained verbatim as **source-document audit citations** (evidence of what
  the Product Chart/SOP said when researched), not deleted — per FR-002 item 1's intent being to
  stop the AI from *using* stale commercial data, not to destroy the audit trail that first
  surfaced the conflicts FR-001 was written in response to. Every such citation is labeled to make
  clear it is never a live, AI-answerable fact.
- "Do not modify product intelligence, SOPs, safety guidance, FAQs, decision trees, Care
  Intelligence" means the *substantive, non-commercial* content of those files is untouched. Where
  an FAQ/AI-Response/Golden-Question/Care-Response-Object entry's specific answer *was* a
  commercial figure (e.g. an FAQ answering "how much does it cost" with a ₹ value), only that
  entry's answer is updated to defer to the live catalog — the rest of the file is unchanged.

**Implemented in:** `LIVE_DATA_MAPPING.md` (new, one per product family), each package's
`knowledge_manifest.json`/manifest-equivalent and Validation Report (updated, not replaced), and
the aggregate `LEGACY_REMEDIATION_REPORT.md` (new, `docs/knowledge-factory/`).

---

## FR-003 — Knowledge Reuse First

- **Date:** 2026-07-31
- **Status:** BINDING, permanent, in effect from MUV White Phenyl™ (Product Family 09) onward
- **Decided by:** Founder
- **Scope:** All present and future Product Knowledge Factory work.

**Decision (as given):**

> "Follow strictly: ... Knowledge Reuse First. ... Before creating any new Knowledge Object:
> Compare with existing packages [a Founder-specified subset, named per task]. Reuse verified
> Parent Knowledge Objects wherever appropriate. Create new Knowledge Objects only when the
> knowledge is genuinely unique. Maintain complete traceability for every reused Knowledge
> Object. Generate a mandatory Knowledge Reuse Summary including: Parent Objects Reused, Shared
> Objects, New Objects, Product-specific Objects, Reuse Percentage."

**Binding interpretation of scope:**
- "Reuse" means reusing **patterns, methodology, and platform-grounded behavioral rules**
  (AI confidence-tier discipline, SAFETY-category escalation, the SupportTicket process, the
  Care Intelligence Truth→Safety→Care sequence, the `LIVE_DATA_MAPPING.md` template, the
  `14_FOUNDER_GAPS.md` register format, the Never-Invent/Unknown-marking convention) — never
  reusing **product-specific facts** (formulation, ingredients, safety content, pack sizes,
  pricing) across products, since those are independently sourced per product per the Never-
  Invent rule. This is the same "methodology reuse, not fact reuse" distinction Dishwash Gel,
  Bathroom Cleaner, Glass Cleaner, and Floor Cleaner's own Knowledge Reuse Reports already
  established informally, before this Founder Decision made it a formal, permanent, mandatory
  requirement.
- Each product family's own task instruction names the specific prior packages to compare
  against — this is not always "all prior packages," and the named subset is followed exactly
  as given, not expanded or substituted.
- "Complete traceability for every reused Knowledge Object" means every reused pattern is cited
  back to the specific KOID or real platform code file it originated from, matching the citation
  discipline already used in every prior Knowledge Reuse Report this session.

**Implemented in:** a `14_Knowledge_Reuse_Summary` section within `13_Reports/` (or an
equivalent report file, per each package's own task instruction) from White Phenyl onward,
including the five required subsections (Parent Objects Reused, Shared Objects, New Objects,
Product-specific Objects, Reuse Percentage).

---

## FR-004 — Variant Inheritance Architecture (Mandatory for Multi-Variant Product Families)

- **Date:** 2026-07-31
- **Status:** BINDING, permanent, in effect from MUV Body Wash™ (Product Family 10) onward
- **Decided by:** Founder
- **Scope:** Every present and future Product Family with more than one fragrance/variant SKU
  under one parent product.

**Decision (as given, from the Body Wash task instruction's "BODY CARE REQUIREMENTS" section and
its new execution-order step "Design Variant Inheritance Architecture"):**

> "Treat [a multi-variant product] as a single Product Family with multiple fragrance variants.
> Shared knowledge must exist only once. Only [variant]-specific knowledge should exist inside
> Variant Knowledge Objects. Never duplicate common knowledge across variants. Implement proper
> Parent / Variant inheritance."

**Binding interpretation of scope:**
- This formalizes, as a permanent standing rule, the architecture first built ad hoc for Floor
  Cleaner (Product Family 06) — one Parent-level set of Knowledge Objects for anything genuinely
  shared (formulation base, manufacturing process, QC, safety, packaging structure, support
  process, AI rules), with Variant-level Knowledge Objects created only for what a fresh source
  audit actually shows differs between variants (fragrance identity, colour, and any variant-
  specific facts the sources state).
- Per Floor Cleaner's own precedent: if a named variant has zero corroborating source material,
  its inheritance status must be marked **unconfirmed**, never silently assumed to inherit the
  Parent's formulation — the same "never invent inheritance" discipline applied to Rose Water.
- A dedicated `Variant_Inheritance_Map` (file or embedded section, per each package's own task
  instruction) must show, explicitly, which Parent Knowledge Objects each variant inherits, and
  which Knowledge Objects are variant-specific overrides — matching Floor Cleaner's
  `17_Variant_Inheritance_Map.md` structure.
- Validation must include a "Variant Inheritance" and "No Duplicate Parent Knowledge" check,
  matching Floor Cleaner's own validation checklist, from Body Wash onward.

**Implemented in:** each multi-variant package's Product Architecture / Variant Inheritance
section, `13_Reports/` (Variant Statistics report, where the task instruction requires it), and
`VALIDATION_RULES.md`'s per-package checklist.

---

## FR-005 — Safety Critical Product Classification (Mandatory for Personal Care / Direct-Contact
Product Families)

- **Date:** 2026-07-31
- **Status:** BINDING, permanent, in effect from MUV Hand Wash™ (Product Family 11) onward
- **Decided by:** Founder
- **Scope:** Every present and future Product Family classified by the Founder as a Safety
  Critical Product — in particular any Personal Care product with direct, sustained, or
  repeated skin/body contact (the category first triggered by Body Wash's zero-safety-content
  finding, now formalized as a standing rule starting with Hand Wash).

**Decision (as given, from the Hand Wash task instruction's "PERSONAL CARE RULES" section):**

> "This is a Safety Critical Product. Apply FR-005. Mandatory documentation: - Usage - Safety -
> Contraindications - First Aid - Storage - Shelf Life. If unsupported by verified sources: Mark:
> - Unknown - Founder Decision Required. Never invent dermatological claims. Never invent
> antibacterial claims. Never invent skin-safe claims."

**Binding interpretation of scope:**
- For every Product Family the Founder designates Safety Critical, six fields are mandatory
  documentation targets, not optional content: **Usage, Safety, Contraindications, First Aid,
  Storage, Shelf Life.** Each must be explicitly addressed by a Knowledge Object — either with a
  real, sourced answer, or with an explicit `Unknown — Founder Decision Required` marker. Silence
  (a field simply not appearing anywhere) is not permitted for a Safety Critical product the way
  it was tolerated for Body Wash's safety section — the gap itself must be recorded, not omitted.
- This directly generalizes the lesson from Body Wash's own Safety Risk Flag finding (zero sourced
  safety content for a direct-skin-contact product, discovered too late to change that package's
  underlying source gap): FR-005 doesn't manufacture sources that don't exist, but it does mandate
  that the *absence* be documented field-by-field rather than left as one general note.
- The Never-Invent discipline is extended with three explicit, named forbidden claim categories
  for Safety Critical products: **dermatological claims, antibacterial claims, skin-safe claims.**
  None of the three may be asserted, implied, or defaulted-to without a real, cited source —
  matching the existing cosmetic/dermatological restraint already applied in Body Wash, now with
  antibacterial and skin-safe claims named explicitly for the first time (relevant in particular to
  any variant whose name or positioning implies protection, e.g. a "Shield"-type variant, which
  must still be verified via source audit and never assumed to be antibacterial by name alone).
- Validation must include a "Safety Critical Compliance" check, distinct from the general "Care
  Intelligence" check, from Hand Wash onward, for every Product Family the Founder classifies this
  way.

**Implemented in:** each Safety Critical package's `08_Safety.md` (Contraindications/First
Aid/Storage/Shelf Life as explicit subsections), `03_Product_Intelligence.md` or equivalent
(Usage), `14_FOUNDER_GAPS.md` (any of the six fields left as `Unknown — Founder Decision
Required`), and `VALIDATION_RULES.md`'s per-package checklist (new "Safety Critical Compliance"
check).

---

## FR-006 — Single Source of Truth Architecture (Website Product Master as CMS Authority)

- **Date:** 2026-07-31
- **Status:** BINDING, permanent, in effect from MUV Car Wash™ (Product Family 12) onward
- **Decided by:** Founder
- **Scope:** Every present and future Product Knowledge Package. Explicitly **not retroactive**
  to any already-authored package's content files (see Binding interpretation below) — this
  narrows how *future* Knowledge Objects are authored, it does not trigger a remediation pass
  the way `FR-002` did for `FR-001`.

**Decision (as given, verbatim from the Founder Architecture Freeze):**

> "The MUV Website Product Master (CMS) is the only authoritative source for operational product
> information. The following fields must NOT be duplicated inside Product Knowledge Objects:
> Usage Instructions, Safety Instructions, Contraindications, First Aid, Storage Conditions,
> Shelf Life, Commercial Product Data (where applicable). Every Product Knowledge Object shall
> reference these fields instead of storing duplicate content." Reference format given verbatim:
> `Source: Website Product Master / Authority: CMS / Retrieval: Runtime / Status: Single Source
> of Truth`.

**Binding interpretation of scope:**
- This **amends `CONSTITUTION.md` Article 1 and Article 3** (see `CONSTITUTION.md` Article 9 for
  the formal amendment) — those articles previously scoped Usage/Safety/Contraindications/First
  Aid/Storage/Shelf Life as content the Knowledge Factory itself owns and authors (matching
  `FR-005`'s six mandatory fields). `FR-006` narrows that: for every package authored from Car
  Wash onward, these six fields are referenced via the CMS pattern above instead of being
  authored inline as sourced-fact-or-`Unknown` content.
- **Real schema mapping (grounded, not invented):** the most direct real-system match for
  "Website Product Master (CMS)" for these six fields is `ProductIntelligence` /
  `ProductIntelligenceVersion.sections` (`prisma/schema.prisma`) — already-built,
  `DRAFT`/`PUBLISHED`-gated JSON storage whose documented section list already includes "Usage
  Instructions, Safety Information... Storage Instructions, Shelf Life" (see `ARCHITECTURE.md`
  §1.2). The Founder's own term "Website Product Master" does not exactly match any single
  Prisma model name; this mapping is the closest evidence-grounded fit and is recorded as an
  inference, not asserted as a confirmed 1:1 mapping — a real, honest gap for the Founder to
  confirm or correct, not silently assumed.
- **Real, disclosed limitation, not to be papered over:** as of this Founder Decision, no MUV
  product family (frozen or in-progress) has real `ProductIntelligence`/`ProductIntelligenceVersion`
  rows populated with Usage/Safety/Contraindications/First Aid/Storage/Shelf Life content. The CMS
  reference pattern is architecturally correct and now mandatory, but it currently points at an
  **empty source** for every product — it relocates where the safety-content gap lives (from the
  Knowledge Factory's own files into the CMS layer), it does not close the gap itself. Every
  package authored under `FR-006` must state this plainly rather than let the CMS-reference
  pattern read as if the content already exists somewhere.
- **Not retroactive.** `MUV Hand Wash™` (Product Family 11) and every earlier package keep their
  existing inline `Unknown — Founder Decision Required` field-by-field content exactly as
  authored — per the Founder's own freeze approval for Product Family 11, this is accepted as a
  real, honestly-disclosed structural difference between pre-`FR-006` and post-`FR-006` packages,
  not a defect requiring rework. `FR-002`-style full remediation was not ordered for this rule.
- `FR-005` itself is not repealed — a Safety Critical Product Family still requires these six
  fields to be accounted for; `FR-006` changes the *mechanism* (CMS reference vs. inline
  Unknown-marker) for packages authored from Car Wash onward, it does not remove the underlying
  requirement that the fields be addressed somehow.

**Implemented in:** `CONSTITUTION.md` Article 9 (new), `ARCHITECTURE.md` §5 (new — CMS Reference
Pattern), `VALIDATION_RULES.md` §7 (new — Single Source of Truth Reference Check), and every
Product Knowledge Package authored from Car Wash onward.

---

## FR-007 — Final Repository Freeze (Mission Complete)

- **Date:** 2026-07-31
- **Status:** BINDING, permanent, in effect immediately
- **Decided by:** Founder
- **Scope:** The entire `docs/knowledge-factory/` repository — all twelve Product Knowledge
  Packages, all four governance documents, and all repository-level tracking documents.

**Decision (as given, verbatim, "MUV Product Knowledge Factory™ — FINAL FOUNDER FREEZE"):**

> "STATUS: FROZEN. The Product Knowledge Factory is now the single authoritative source of
> product intelligence for the MUV AI ecosystem. No new product knowledge shall be created,
> modified, or duplicated within this repository unless explicitly authorized by the Founder.
> Future Knowledge Factories shall reference this repository but shall never modify it. Knowledge
> Ownership: IMMUTABLE. Repository Status: READ ONLY. Mission Status: COMPLETE."

**Binding interpretation of scope:**
- This is a **repository-wide** freeze, distinct in kind from every prior per-product-family
  freeze event (`FULL FREEZE`/`RE-FREEZE`/`CONDITIONAL FREEZE`/`FINAL FREEZE`, all recorded in
  `FREEZE_LOG.md`). Those governed one package each; this governs the repository as a whole,
  including the governance documents themselves.
- **No file under `docs/knowledge-factory/` may be created, modified, or duplicated going
  forward without explicit, current, direct Founder authorization** — this applies uniformly to
  all twelve product packages (regardless of their individual status — `FROZEN, APPROVED`,
  `CONDITIONAL FREEZE`, `FINAL FREEZE`, or `MUV Car Wash™`'s own `DRAFT — Pending Founder
  Review`), to `CONSTITUTION.md`/`ARCHITECTURE.md`/`VALIDATION_RULES.md`/`FOUNDER_RULES.md`
  themselves, and to `REPOSITORY_INDEX.md`/`PRODUCT_REGISTRY.md`/`FREEZE_LOG.md`/`CHANGE_LOG.md`.
- **Honest note on `MUV Car Wash™`'s own package status:** this Founder Decision does not use the
  per-package freeze language (`CONDITIONAL FREEZE`/`FINAL FREEZE`) previously used to approve an
  individual package for that status — it is a blanket repository-level declaration. Car Wash's
  own `MASTER_Car_Wash.md` status field is therefore left recorded exactly as it was
  (`DRAFT — Pending Founder Review`), not silently upgraded to a per-package freeze status it was
  never explicitly given — while still being covered, like everything else in the repository, by
  this rule's blanket no-modification-without-authorization requirement. This distinction is
  recorded plainly rather than resolved by assumption.
- **Future Knowledge Factories** (for any subsequent product line, system, or repository) may
  reference this repository as a read-only source of precedent and pattern, but must never write
  to or modify any file within it.
- This rule does not itself amend `CONSTITUTION.md`/`ARCHITECTURE.md`/`VALIDATION_RULES.md` the
  way `FR-006` did — there is no new Article/section to author, since the effect of this rule is
  to stop all further authoring, not to change how future authoring works.

**Implemented in:** `REPOSITORY_INDEX.md` (repository-wide status banner), `FREEZE_LOG.md` (final
repository-freeze event, distinct from per-package events), `CHANGE_LOG.md` (closing entry,
Mission Status: COMPLETE). No product package content file was created or modified to implement
this entry — recording the decision is itself the only action this rule requires.
