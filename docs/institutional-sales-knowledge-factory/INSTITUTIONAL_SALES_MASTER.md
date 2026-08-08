# MUV Institutional Sales Knowledge Factory™

> Authorized via Founder Execution Protocol v1.0 (Institutional Sales), Fast Execution Mode.
> A new, standalone repository — not a domain of the MUV Marketing Knowledge Factory — built to
> power the future **MUV Institutional Sales AI™**. Lean single-repository artifact format:
> `INSTITUTIONAL_SALES_MASTER.md`, `KNOWLEDGE_OBJECTS.md`, `RELATIONSHIPS.md`, `VALIDATION.md`,
> `FOUNDER_REVIEW.md`, `JSON/{institutional_sales_manifest,knowledge_objects,relationships,
> validation}.json`.

## 1. Scope discipline

This repository is dedicated **only** to Institutional Sales. Retail, dealer, distributor, and
general-sales content is included **only where the source material treats it as the
inseparable supporting mechanism for an institutional transaction** (e.g., the generic sales
process an institutional account also moves through) — never as its own subject. Distribution-
channel content that is genuinely about retailers/distributors/franchise partners (partner
onboarding, distributor relationship management, geographic/channel expansion, inter-channel
conflict) is explicitly **excluded** as out of scope, even though it lives in the same source
chapter as the content this repository does mirror.

## 2. Source-mapping research — completed before any Knowledge Object was authored

A full scan of the MUV Knowledge Library (81 chapters, 14 Parts, independently verified at
20,845 lines) found:

- **No chapter or Part is dedicated to institutional selling.** The single most relevant
  subsection is "Institutional Partnerships" — nine bullet points — inside Part VIII, Chapter
  37 ("Sales & Distribution"), the same chapter already fully mirrored, in full, as the Marketing
  Knowledge Factory's Domain 4, Chapter 2 (`KO-SC-CH2-*`, frozen).
- **Zero occurrences** of any of the thirteen institutional customer types named in the Founder's
  Expected Knowledge Scope — hospitals, hotels, laundry, restaurants, cafes, schools, colleges,
  industries, corporate offices, garments, car wash centers, cleaning contractors, facility
  management — searched individually and confirmed absent. ("Car wash" appears once, but only as
  a *product* formulation SOP reference, not a customer-segment description.)
  Search verified via ripgrep across the full source file.
- **Zero occurrences** of "consumption estimation," "product recommendation logic," "customer
  segmentation," "competitive positioning"/"competitor" (beyond scattered anti-copying
  warnings), "sales visit planning," "account growth," or "institutional customer journey" as
  named concepts.
- A single glossary-only definition of "Return on Investment (ROI)" exists (one sentence, no
  framework); no dedicated ROI-communication methodology exists anywhere.
- **Zero occurrences** of any of the nine named Founder Original IP capabilities (§4).
- What **does** exist and is genuinely relevant: the generic B2B sales mechanics of Chapter 37
  (Sales Process, Lead Generation, Qualification, Customer Understanding, Sales Conversation,
  Demonstration, Objection Handling, Follow-Up, Conversion Discipline, Sales Documentation) —
  equally applicable to institutional accounts as to any other B2B buyer, included here as
  **required supporting context**, not distribution-channel content; the "Institutional
  Partnerships" list itself; institutional-specific communication content scattered across two
  Domain-2 chapters (Part VII Ch.32's "Retail and Institutional Communication," Ch.34's
  "Institutional" channel-marketing subsection and Sales Enablement table); and Chapter 36's
  "Revenue Responsibility & Long-Term Relationship Building," the closest existing analog to
  institutional relationship building and account growth.

## 3. Architecture decision: mirror, not cite

Because this repository must stand alone to power a separate AI product (the MUV Institutional
Sales AI™, distinct from any Marketing AI drawing on the Marketing Knowledge Factory), its
Knowledge Objects **mirror** the relevant verbatim source content directly — they are not
citation-only pointers into the Marketing Knowledge Factory. Per Reference Before Create, this
repository's Knowledge Object structure reuses the existing, already-verified breakdown from
Marketing KF's `KO-SC-CH2-*`, `KO-PM-CH2-012`, `KO-PM-CH4-009/010/011`, and `KO-SC-CH1-007` —
avoiding re-deriving structure from scratch — and each mirrored Knowledge Object records that
KOID as a **provenance cross-reference** (informational, not a hard dependency) so the two
repositories' content can be cross-checked for consistency without creating a runtime coupling
between two independent AI products.

## 4. Founder Original IP — Gap Records only, confirmed absent, never designed

| Founder Original IP | Confirmed absent | Recorded as |
|---|---|---|
| AI Opportunity Scoring Engine™ | Yes | `KO-IS-024` |
| AI Consumption Prediction Engine™ | Yes | `KO-IS-025` |
| AI Meeting Review Engine™ | Yes | `KO-IS-026` |
| AI Negotiation Engine™ | Yes | `KO-IS-027` |
| AI Proposal Optimizer™ | Yes | `KO-IS-028` |
| AI Territory Planner™ | Yes | `KO-IS-029` |
| AI Sales Coach™ | Yes | `KO-IS-030` |
| AI Follow-up Intelligence™ | Yes | `KO-IS-031` |
| AI Revenue Forecast Engine™ | Yes | `KO-IS-032` |

## 5. Knowledge Object structure (33 KOs)

| Range | Type | Count |
|---|---|---|
| KO-IS-001 – 011 | Mirrored (verbatim source content) | 11 |
| KO-IS-012 – 023 | Gap Record (requested, confirmed absent) | 12 |
| KO-IS-024 – 032 | Gap Record (Founder Original IP) | 9 |
| KO-IS-033 | Repository Governance Summary | 1 |

See `KNOWLEDGE_OBJECTS.md` for full content.

## 6. Architecture verification

New repository, new KOID prefix `KO-IS-` (Institutional Sales) — no collision with any of the
eight existing prefixes across the Marketing Knowledge Factory (`KO-BI`, `KO-PM`, `KO-CI`,
`KO-SC`, `KO-DM`, `KO-CC`, `KO-GO`, `KO-MO`). Lean single-repository artifact format applied
exactly as specified — no chapter- or domain-subfolder structure. The Marketing Knowledge
Factory (frozen/complete domains) is referenced for provenance only, never modified.

**Result: PASS.**
