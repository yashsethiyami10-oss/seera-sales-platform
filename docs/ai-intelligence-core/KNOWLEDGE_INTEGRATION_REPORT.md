# Stage 6D — Knowledge Integration Report

**Status:** All 4 completed Knowledge Factories are now integrated into the Semantic Retrieval Engine
via real, file-backed retrieval. No placeholder, dummy, or simulated repository at any point.
**Constraint honored:** no new runtime module was created — this stage extends the existing Semantic
Retrieval Engine, Conflict Resolution Runtime, Founder Reasoning Runtime, and Response Assembly Runtime
(all Stage 6C modules), plus a new data-access layer (`knowledge-factory-loader.ts`/
`knowledge-factory-retrieval.ts`) that is infrastructure for the existing Semantic Retrieval Engine, not
an 11th pipeline stage.

---

## 1. What real integration means here

Every one of the 4 Knowledge Factories is markdown/JSON on disk under `docs/*-knowledge-factory/` — none
was database-backed before this stage (confirmed and documented as an open gap in Stage 6C's
`RUNTIME_IMPLEMENTATION_REPORT.md` §2.3). This stage builds a real, deterministic file-parsing and
retrieval layer:

| File | Role |
|---|---|
| `lib/runtime/knowledge-factory-loader.ts` | Recursively reads every real `.md` file under the 4 Knowledge Factory directories, parses real `## KO-XXX — Title` and `## Article N — Title` sections into an in-memory index. Never regenerates or edits source content. |
| `lib/runtime/knowledge-factory-retrieval.ts` | Deterministic keyword/KOID search + fixed authority-weight table over that index. |
| `lib/runtime/semantic-retrieval.ts` (extended) | Merges file-backed results with Module 5's existing DB-backed results into one ranked set. |
| `lib/runtime/conflict-resolution-runtime.ts` (extended) | New guard: Founder Intelligence content structurally excluded from winning a fact conflict, per FD-AIC-002. |
| `lib/runtime/founder-reasoning-runtime.ts` (extended) | Surfaces real, retrieved Founder Constitution/Engine content in `principlesApplied`. |
| `lib/runtime/response-assembly-runtime.ts` (extended) | Discloses when cited content is still DRAFT/pending Founder review. |
| `lib/runtime/intent-engine.ts` (extended) | A few additional real lexicon terms, added after acceptance simulation showed genuine Marketing/Founder-domain questions were misclassified as GENERAL and therefore never searched the newly-integrated factories. |

## 2. Real load results (verified by script against the actual repository, not estimated)

```
PRODUCT_KF:              291 files scanned, 673 Knowledge Objects parsed
MARKETING_KF:             461 files scanned, 414 Knowledge Objects parsed
INSTITUTIONAL_SALES_KF:     5 files scanned,  33 Knowledge Objects parsed
FOUNDER_INTELLIGENCE_KF:    7 files scanned,  45 Knowledge Objects parsed
TOTAL:                                      1,165 Knowledge Objects indexed
```

Every one of the "414 KOs" (Marketing), "33 KOs" (Institutional Sales), and "32 KOs + Constitution
Articles" (Founder Intelligence) figures from the earlier build phases is now independently confirmed by
this stage's own parser — not merely restated from memory. The Product KF total (673) had no prior
official KO count in this project's own docs to compare against; this is the first time it has been
counted.

## 3. KOID / relationship / authority preservation

- **KOIDs preserved exactly** — `koid` is the literal string from each `## KO-XXX` header, used directly
  as `recordId` in every `RuntimeKnowledgeResult`.
- **Relationships preserved** — the real `Relationships:` field text is regex-scanned for literal KOID
  tokens and carried into `sourceReferences`, not re-derived or guessed.
- **Repository boundaries preserved** — every result's `internalMetadata.koFactoryDomain` records which of
  the 4 factories it actually came from; nothing is merged or relabeled across factories.
- **Authority preserved and extended** — a fixed weight table (`PRODUCT_KF` 0.85, `MARKETING_KF`/
  `INSTITUTIONAL_SALES_KF` 0.8, `FOUNDER_INTELLIGENCE_KF` 0.6) combined with each KO's real, parsed
  approval status (`APPROVED`/`REVIEW_READY`/`DRAFT`/`OPEN_PENDING_FOUNDER_INPUT`/`UNKNOWN`) — never a
  single flat weight. **DRAFT-status content is never presented with the same confidence as approved
  content** — `response-assembly-runtime.ts` now appends an explicit disclosure whenever cited content is
  DRAFT/pending.

## 4. Real bugs found and fixed during this stage's own testing (not merely documented)

Testing against the actual 1,165-object corpus — not fixtures — surfaced defects fixture-only testing
structurally cannot catch:

1. **Content-marker regex too strict.** Some real KOs (e.g. `KO-IS-001`) use
   `**Content — Figure 2.1 — Sales Journey Framework:**` instead of the plain `**Content:**` marker every
   sampled file during recon happened to use. The original regex silently produced empty content for
   these. Fixed: `/\*\*Content[^*\n]*:\*\*\s*/`.
2. **Constitution Article ID collision across two different real documents.** `docs/knowledge-factory/
   CONSTITUTION.md` (the Product Knowledge Factory's own constitution — not discovered during initial
   recon, which only sampled per-product files) independently uses the same `## Article N — Title` format
   as `docs/founder-intelligence-knowledge-factory/FOUNDER_CONSTITUTION.md`. A fixed `FC-ARTICLE-{N}` id
   scheme silently let the Product KF's Article 1 shadow the real Founder Constitution's Article 1 —
   `Array.find()` returned whichever file the directory walk reached first. Fixed by namespacing the
   synthetic id with the real source filename (`CONSTITUTION-ARTICLE-1` vs.
   `FOUNDER-CONSTITUTION-ARTICLE-1`), and a regression check was added asserting the two never collide.
3. **Title field ignored.** The parser originally used the bare `## KO-XXX — <short label>` header text as
   `title`, but many real KOs' actual product-qualified name only exists in the metadata block's separate
   `**Title:**` field (e.g. header text "Ingredient List with Generic Functional Context" vs. the real
   title "MUV Dishwash Gel™ — Ingredient List & Generic Functional Roles"). Fixed to prefer `**Title:**`/
   `**Name:**` when present.
4. **Search ranking capped scores before sorting**, causing many same-product KOs to tie at the score
   ceiling and fall back to arbitrary file-order tie-breaking, hiding genuine content-relevance
   differences. Fixed: sort on the uncapped raw score, clamp only the displayed `confidence` afterward.

All 4 were caught by `scripts/verify-stage6d-knowledge-integration.ts` and
`scripts/verify-stage6d-founder-acceptance.ts` running against the real corpus, fixed, and re-verified
(33/33 and 24/24 scenarios respectively, both clean) before this report was written.

## 5. Founder Intelligence exclusion from fact arbitration (FD-AIC-002 operationalized)

`conflict-resolution-runtime.ts` now contains a dedicated guard: whenever exactly one side of a detected
conflict is Founder-Intelligence-KF-sourced and the other is not, the Founder Intelligence side is
structurally disqualified from winning — regardless of its computed authority weight — per FD-AIC-002's
own clarifying nuance ("Founder Intelligence may guide reasoning, but may not overwrite verified domain
facts"). Verified against real data: a real Product KF ingredient KO vs. the real Founder Constitution's
Article 1, put into an artificial status conflict, correctly resolves in the Product KF's favor with a
rationale naming the exclusion rule explicitly.

## 6. Honest limitations (do not overstate)

- **Deterministic keyword search, not semantic search** — unchanged from Stage 6C's own disclosure. A
  KO can outrank a more "obviously right" one simply by repeating query words more densely (concretely
  observed: `KO-DW-FAQ-001` outranked `KO-DW-ING-001` for an ingredients-focused query because the FAQ
  happens to repeat more of the query's literal words).
- **Customer Care Knowledge Factory does not exist** — nothing to integrate for it; `CUSTOMER_CARE` domain
  intentionally maps to zero Knowledge Factories.
- **Intent Classification is the real remaining bottleneck**, not retrieval. Discovered directly via this
  stage's own Founder Acceptance simulation: several real, on-topic questions (e.g. "What is the Brand
  Philosophy and how does it connect to MUV Darshan?") were classified `GENERAL_QUESTION` and therefore
  never searched any Knowledge Factory at all — even though the content genuinely exists and is retrievable
  (proven separately via direct KOID lookup). A handful of lexicon terms were added to close the most
  obvious gaps found this way; this is not a complete fix, and Hindi/Hinglish phrasing still is not
  recognized by the (English-only) lexicon at all.
- **All Product KF content sampled is DRAFT status**; most Marketing/Institutional Sales KF content is
  `REVIEW_READY`, not `APPROVED` — none of the 1,165 KOs is Founder-approved in the fullest sense yet. This
  is now visible and disclosed at retrieval time, not hidden, but it means most grounded responses in this
  stage's simulations correctly carry a "still pending Founder review" notice.
