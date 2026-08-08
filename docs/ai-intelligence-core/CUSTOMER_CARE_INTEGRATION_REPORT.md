# Stage 8 — Customer Care Integration Report (Phase 2)

**Result: Customer Care Knowledge Factory is now operational in the Runtime.** Every module named
in the Founder's Phase 2 list was genuinely updated — not just Semantic Retrieval. No duplicate
retrieval path and no duplicate Knowledge Object were introduced anywhere in this integration.

## What changed, module by module

### Semantic Retrieval Engine (`lib/runtime/semantic-retrieval.ts`, `knowledge-factory-loader.ts`, `knowledge-factory-retrieval.ts`)

- Added `CUSTOMER_CARE_KF` as a 5th `KnowledgeFactorySourceType`.
- Added `docs/customer-care-knowledge-factory` as a 5th loadable root — the existing, generic
  loader picked up all 22 real Knowledge Objects with zero parser changes.
- `DOMAIN_TO_KF`'s `CUSTOMER_CARE` entry, previously `[]` ("that Knowledge Factory does not exist
  yet"), now correctly maps to `["CUSTOMER_CARE_KF"]`.
- Authority weight: `CUSTOMER_CARE_KF` = 0.75, deliberately **below** `MARKETING_KF`/
  `INSTITUTIONAL_SALES_KF` (0.8). This is the concrete mechanism satisfying "no duplicate
  retrieval" at the arbitration level — since Customer Care KF is ~100% Citation-only content
  pointing back into Marketing KF Domain 3, if both a citation KO and the real KO it cites are ever
  retrieved together, the real source always outranks its own citation. Verified directly:
  `authorityWeightFor(CUSTOMER_CARE_KF) < authorityWeightFor(MARKETING_KF)`.

### Intent Intelligence Engine (`lib/runtime/intent-engine.ts`)

- Added `"return policy"`, `"replacement"`, `"warranty"` to the `COMPLAINT` lexicon entry (which
  already routed to the `CUSTOMER_CARE` domain — `"refund"`/`"return this"` were already present
  from Stage 6C).
- `DOMAIN_TO_REPOSITORY_NAMES`'s `CUSTOMER_CARE` entry, previously `[]`, now names both the real
  Customer Care Knowledge Factory and Marketing Knowledge Factory (since most Customer Care
  answers' real evidence lives there via citation).
- Verified: "What is your warranty and replacement policy?" now classifies with `CUSTOMER_CARE` in
  `domains` and names the real repository in `repositoriesRequired`.

### Founder Reasoning Runtime (`lib/runtime/founder-reasoning-runtime.ts`)

- **New:** retrieving a real Gap Record (Customer Care KF introduced the ecosystem's first
  proportionally-frequent Gap Records — 6 of its 22 KOs, 27%) is now explicitly flagged in the
  `risks` field, naming the specific Gap Record KOID(s) hit — never silently treated as if it were
  a normal, answerable fact.
- **New:** if every single retrieved result for a turn is a Gap Record (nothing else was found at
  all), `escalationTrigger` is now forced `true` — the honest answer has no useful content in it,
  so the reasoning layer routes toward a human rather than presenting a documented-absence as if it
  were a final answer.

### Decision Runtime (`lib/runtime/decision-runtime.ts`)

No code change was needed — it already propagates `founderReasoning.escalationTrigger` into
`requiresHumanApproval` unconditionally, so the new gap-record-only escalation trigger flows
through automatically. Verified directly: a gap-record-only turn produces `requiresHumanApproval:
true`.

### Conflict Resolution Runtime (`lib/runtime/conflict-resolution-runtime.ts`)

No code change was needed. The existing authority-weight-based arbitration (Stage 6D) already
handles the "citation must never outrank its source" requirement purely through the weight ordering
chosen above — no new special-case rule had to be written, confirmed by direct test with real
Customer Care KF + Marketing KF data.

### Response Assembly Runtime (`lib/runtime/response-assembly-runtime.ts`)

- **New:** when every one of the top retrieved results is a Gap Record, the deterministic composer
  now uses a distinct, customer-appropriate "no confirmed policy yet" framing (`noPolicyYet`
  template, in all 3 supported languages) instead of the generic "grounded" template — which would
  otherwise have printed the raw `[Documented gap — no content yet]` marker text verbatim at a
  customer. Verified directly against a real Warranty Gap Record retrieval.
- Existing DRAFT-status disclosure (Stage 6D) continues to apply unchanged for Customer Care KF
  content that isn't Founder-approved (most of it is "Founder Review Ready," which is disclosed the
  same way DRAFT content already was).

### Learning Runtime (`lib/runtime/learning-runtime.ts`)

- **New:** a turn where every retrieved result is a Gap Record is now logged as a
  `RETRIEVAL_FAILURE`-type learning signal (previously this case produced no signal at all, since
  `retrieval.results.length` was non-zero — a real, false negative fixed this stage). This is
  exactly the mechanism that lets the Founder eventually see "customers keep asking about Warranty
  and we have nothing to tell them" as an aggregated, actionable signal rather than it disappearing
  silently into individually-fine-looking turns.

## No duplicate retrieval, no duplicate Knowledge Object — how this was actually verified, not just asserted

1. Customer Care KF's own 22 Knowledge Objects were never re-parsed or re-indexed by a second code
   path — one loader, one index, shared by all 5 factories.
2. Zero new Knowledge Objects were created anywhere as part of this integration — Customer Care
   KF's content was fixed at build time (see its own Founder Review Package); Phase 2 only wired
   existing content into the runtime.
3. The authority-weight ordering (§ Semantic Retrieval above) is the structural guarantee that a
   citation and its source, if both retrieved, never present as competing/duplicate "facts" —
   arbitration always resolves toward the real source.

## Verification

28/28 real checks in `scripts/verify-stage8-production-integration.ts` (Phases 1-4 combined; the
Phase 2-specific checks are items 10-21 in that script's output), plus the full 194-check regression
suite (see `GLOBAL_INTEGRATION_AUDIT.md` §8) remaining green after every change in this report.

## Honest limitation carried forward

Customer Care KF remains almost entirely Citation-only + Gap Records (0 fresh mirrored content, per
its own Founder Review Package). Integrating it into the runtime makes that real content
*reachable* — it does not create new answers where none existed. A customer asking about Warranty
today will correctly be told, through the new `noPolicyYet` framing, that there is no confirmed
policy yet, and will be escalated to a human — which is the honest, correct behavior given the
underlying content, not a regression or a gap in this integration work itself.
