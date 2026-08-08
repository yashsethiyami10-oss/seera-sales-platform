# Domain 1 — Brand Intelligence

> Domain-level Requirement Analysis. This defines the chapter breakdown for this domain, executed
> once, before any chapter content is authored — per the Execution Model's own pipeline
> (Requirement Analysis precedes everything else).

---

## Domain scope

Brand Intelligence is the knowledge domain covering MUV's brand identity, voice, positioning,
visual system governance, and identity-decision history — the knowledge a future AI must draw on
whenever it represents, describes, or protects the MUV brand across any marketing surface.

## How the chapter breakdown was derived (evidence, not invention)

Per the Knowledge Efficiency Framework's "Reference before Create," this domain's chapters are
**not** an invented marketing-framework taxonomy. They mirror, exactly, the real chapter
structure of the MUV Knowledge Library's own **Part III — MUV Brand Sutra™** (Chapters 11–15),
confirmed by direct reading of `.claude/docs/MUV-KNOWLEDGE/SOURCE DOCUMENTS/MUV KNOWLEDGE
LIBRARY/# final MUV Knowledge Library™.txt`, lines 1682–2643 and the file's own Master Index
(line 20742). This is the single, centralized, authoritative source for MUV brand identity in
this codebase — no other brand guideline, brand book, or logo/visual-identity source document
exists anywhere in the repository (confirmed via direct search).

**Evidence Classification: Verified** (the chapter list is a direct transcription of an existing,
real source document's own structure, not a derived or invented taxonomy).

## Chapter list (frozen for this domain, per Execution Model)

| # | Chapter | Source Chapter (Knowledge Library, Part III) | Real Scope (per source, not title-guessed) |
|---|---|---|---|
| 1 | **Brand Origin & Naming** | Chapter 11 | Brand Identity Foundation (§1), Brand Philosophy (§2), Mission/Vision/Direction (§3), Brand Positioning (§4) |
| 2 | Logo & Mark System | Chapter 12 | Customer Promise (§5), Brand Personality (§6), Visual Identity Principles (§10), Logo Usage Principles (§11) |
| 3 | Language, Pronunciation & Tagline | Chapter 13 | Pronunciation Standard, Written Identity, Tone of Voice (§7), Messaging System (§8), Keep Muving™ Philosophy (§9) |
| 4 | Identity Governance | Chapter 14 | Typography (§12), Colour Philosophy (§13), Iconography (§14), Photography (§15), Packaging Identity (§16), Digital/Marketplace Consistency (§17–18) |
| 5 | Brand Decision History | Chapter 15 | Decision History, Identity Decision States, Internal Brand Governance (§19), Brand Protection Rules (§20) |

**Important precision note:** despite Chapter 1's title including "Naming," pronunciation and
written-form rules are **not** in scope for Chapter 1 — the source's own real Chapter 11 content
does not cover pronunciation (that is Chapter 13's content, §"Pronunciation Standard"). This
domain preserves the source's real content boundaries exactly, not a title-based guess at scope.

## Cross-cutting evidence (not a separate chapter — woven into relevant chapters as it applies)

- **Muv AI Sutra™**, §6.3 (Website/Customer Care AI) and §6.6 (Marketing AI) define how any AI
  must behave when representing the MUV brand (approved terminology, brand-language protection,
  boundaries against inventing claims/certifications/philosophy). This is genuinely relevant
  across every chapter in this domain, not scoped to one — it will be cited as supporting
  Evidence wherever a chapter's content is the specific brand fact that AI section protects.
- **`PHASE_3_BRAND_EXPERIENCE_LANGUAGE.md`** provides brand voice/copywriting/experience content
  that is complementary to, and in one confirmed instance contradicts, the Knowledge Library.
  Per `docs/phase-1/PHASE_1A_KNOWLEDGE_REFERENCES.md`'s own prior resolution, **the Knowledge
  Library supersedes this legacy phase document wherever they conflict.** This domain follows
  that same resolution rule rather than re-litigating it.

## Dependencies on other domains/factories

- **Product Knowledge Factory** (`docs/knowledge-factory/`, frozen): referenced, never modified,
  for any product-specific fact a Brand Intelligence chapter might otherwise be tempted to
  restate (e.g., product names, category naming) — Brand Intelligence owns identity, not product
  facts.
- **Future domains** (Content Intelligence, Creative Intelligence) will depend on this domain's
  Chapters 2–4 (visual/voice rules) once built — noted as a forward dependency, not built now.

## Stop Rule applied

Per the Execution Model, only **Chapter 1** is executed now. Chapters 2–5 are named and scoped
above (satisfying "Requirement Analysis" for the whole domain, done once), but not authored.
Execution stops after Chapter 1 for Founder review, per the Stop Rule.
