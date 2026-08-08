# MUV Founder Intelligence Knowledge Factory™ — Engine Master

> Subordinate to `FOUNDER_CONSTITUTION.md`. Defines the reusable schema every reasoning Knowledge
> Object applies (Single Source of Truth — not repeated per KO), then the ten Engines built on
> top of it, in the Founder's specified execution order.

---

## 1. Reasoning Discipline (governs every Engine)

This repository never produces a direct answer. It produces reasoning frameworks the future MUV
AI applies to generate an answer. A Knowledge Object that states "the answer is X" instead of
"here is how to reason toward an answer for a question of this shape" violates this repository's
purpose, regardless of how accurate X happens to be.

## 2. The Founder Thinking Pipeline (mandatory sequence for every reasoning Knowledge Object)

**Understand → Care → Knowledge → Reason → Recommend → Verify → Learn**

This is not invented for this repository — it is the direct structural descendant of Part I's own
two founder-sourced cycles: the **Keep Muving Loop** (See Clearly → Clean → Decide → Move →
Verify → Continue) and the **Decision Ladder** (Proposal → Exploration → Qualified Direction →
Approved Decision → Preserved Rule). The mapping is explicit:

| Founder Thinking Pipeline stage | Grounded in | What it requires |
|---|---|---|
| **Understand** | Keep Muving Loop's "See Clearly" | State the real situation without assumption |
| **Care** | MUV Darshan's Trust/Movement filter | Confirm why this matters to a real customer or the business, not only that it is possible |
| **Knowledge** | The Doctrine Gate's "Founder authority" test | Gather only verified, sourced input — apply Article 3 (Never Invent) |
| **Reason** | Decision Ladder's "Exploration" | Weigh options and trade-offs explicitly — apply Article 4 (Evidence Proportional to Claim) |
| **Recommend** | Decision Ladder's "Approved Decision" | State the preferred option and when it does *not* apply |
| **Verify** | Keep Muving Loop's "Verify" | Check the recommendation against the Constitution and against real evidence before treating it as final |
| **Learn** | Decision Ladder's "Preserved Rule" | Record the outcome so the next reasoning pass does not repeat the discovery — apply Article 6 (Not Safe Until Preserved) |

## 3. The Founder Decision Model (mandatory field set for every reasoning Knowledge Object)

Every reasoning Knowledge Object's `Content` section addresses these fourteen fields. Where a
field is not meaningfully answerable for a given Knowledge Object's scope (e.g., a philosophy-
level framework may have a thin "Customer Impact" field), that is stated plainly rather than
padded — per Token Efficiency Mode's instruction to avoid repetitive boilerplate.

1. **Situation** — what circumstance triggers this reasoning
2. **Context** — the surrounding facts and constraints
3. **Objective** — what a good outcome looks like
4. **Inputs** — what evidence/knowledge this reasoning requires (cites Constitution Articles and
   source KOIDs)
5. **Options Considered** — the real alternatives, not a single default
6. **Reasoning** — why the preferred option wins, tied to evidence (Article 4)
7. **Trade-offs** — what is given up by choosing the preferred option
8. **Risks** — what could go wrong, and how it would be noticed
9. **Customer Impact** — how this affects the person on the other end
10. **Business Impact** — how this affects Muv commercially or operationally
11. **Long-term Impact** — how this affects trust and memory over time (Article 10)
12. **Preferred Decision** — the recommended reasoning outcome, stated as a rule, not a specific
    fabricated instance
13. **When NOT to Use This Decision** — the boundary condition, per Article 7 (Change Only What
    Was Authorized) applied to reasoning itself
14. **Review Trigger** — what event should cause this reasoning framework itself to be revisited
    (Article 6/8)
15. **Evolution Notes / Founder Notes** — open questions, provenance, and anything the Founder
    should confirm or correct

## 4. KOID convention

Prefix `KO-FD-` (Founder Intelligence), format `KO-FD-{ENGINE}-{NNN}`, where `{ENGINE}` is a
two-letter engine code (below). No collision with any of the nine existing prefixes across the
Marketing Knowledge Factory (`KO-BI`, `KO-PM`, `KO-CI`, `KO-SC`, `KO-DM`, `KO-CC`, `KO-GO`,
`KO-MO`) or the Institutional Sales Knowledge Factory (`KO-IS`).

## 5. The ten Engines, in Founder-specified execution order

| # | Engine | Code | Primary evidence base | Constitution Articles most directly applied |
|---|---|---|---|---|
| 1 | Founder Philosophy Engine™ | PH | MUV Knowledge Library Part I, Ch.1-4 | 1, 2, 8, 10, 11 |
| 2 | Founder Decision Intelligence™ | DI | MUV Knowledge Library Part I, Ch.5 | 4, 5, 6, 7, 12 |
| 3 | Founder Product Intelligence™ | PI | Product Knowledge Factory `CONSTITUTION.md`/`FOUNDER_RULES.md` | 3, 5, 8 |
| 4 | Founder Marketing Intelligence™ | MI | Marketing Knowledge Factory Domains 1, 2, 6 | 2, 4, 10 |
| 5 | Founder Sales Intelligence™ | SI | Marketing KF Domain 4, Institutional Sales KF | 4, 7 |
| 6 | Founder Business Intelligence™ | BU | MUV Knowledge Library Part XIV; Marketing KF Domain 4 Ch.1 | 9 |
| 7 | Founder Optimization Intelligence™ | OP | Marketing Knowledge Factory Domain 7 | 9, 10 |
| 8 | Founder KPI Intelligence™ | KP | Marketing Knowledge Factory Domain 2 Ch.5, Domain 7 | 4, 10 |
| 9 | Founder Learning Intelligence™ | LN | Marketing Knowledge Factory Domain 8; Part I Ch.5 | 5, 6, 11 |
| 10 | Founder AI Governance™ | AG | Marketing KF Domain 5 Ch.10, Domain 2 Ch.3, Domain 6; every Gap Record discipline across all three prior repositories | 3, 12, 13 |

Each Engine's Knowledge Objects are authoritative-reference-only where evidence exists, and
Gap-Recorded where the Founder's own explicit reasoning on a sub-topic is not yet evidenced
strongly enough to state as a framework — per `FOUNDER_CONSTITUTION.md` Article 3. See
`KNOWLEDGE_OBJECTS.md` for full content and `FOUNDER_CONSTITUTION_MAPPING.md` for the complete
per-KO Article cross-reference.

## 6. Architecture verification

New repository, new KOID prefix `KO-FD-`, no collision with any existing prefix across the MUV
Knowledge Factory ecosystem (11 prefixes now exist in total). Lean single-repository artifact
format applied exactly as specified: `FOUNDER_CONSTITUTION.md`, `FOUNDER_CONSTITUTION_MAPPING.md`,
`ENGINE_MASTER.md`, `KNOWLEDGE_OBJECTS.md`, `RELATIONSHIPS.md`, `VALIDATION.md`,
`FOUNDER_REVIEW.md`, `JSON/*` — no per-Engine subfolder structure, no chapter-level files. All
three prior repositories (Marketing Knowledge Factory, Institutional Sales Knowledge Factory,
Product Knowledge Factory) are referenced as authoritative sources, never modified.

**Result: PASS.**
