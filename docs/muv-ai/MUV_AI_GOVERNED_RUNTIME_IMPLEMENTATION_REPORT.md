# MUV AI — Governed Runtime Implementation Report (Block 2B, Phase B: Stages 4–6)

**Status:** Governed four-layer runtime integration verified. Provider-off scenario suite passing.
**Not the final FAT.** No production deployment, no publish action, no provider activation occurred.

## 1. Stage 4 — Four-layer runtime integration

**Finding, not a build:** the customer-facing turn pipeline (`components/muv-ai/muv-ai-widget.tsx` →
`actions/experience.ts` → `lib/gateway/ai-gateway.ts` → `lib/experience/experience-orchestrator.ts`)
already calls Module 6's `buildIntelligence()`, which already calls Module 5's `runRetrievalPipeline()`
against exactly the four intelligence tables (`lib/retrieval/sources.ts`, verified in Stage 3). The
frozen architecture's ordering — Intent/Context → KnowledgeItem → ProductIntelligence →
ProblemIntelligence → CareIntelligence → Decision Intelligence — is already implemented and already
the *only* path for the main customer answer; there is no separate `Product`/`ProductContent` bypass
for the primary response (`Product`/`ProductContent` are only read for an ancillary product-card
enrichment step and for a still-dormant, unwired `lib/gateway/knowledge/knowledge-api.ts`). Nothing
was redesigned — Stage 4's job was to verify this held under real, populated data, which required no
architecture change.

**A structural governance fact confirmed by reading the type, not assumed:**
`IntelligenceRequest.retrieval` (`lib/intelligence/types.ts`) never exposes a `versionSelector` field.
`buildIntelligence()` can therefore only ever request `mode: "published"` content — there is no code
path, for any caller at any clearance level, to retrieve DRAFT/REVIEW content through the real
orchestrated pipeline. Since every row Stage 2 populated is intentionally DRAFT-only (never
auto-published, per the population module's own hard rule), **none of today's populated intelligence
is retrievable through the live pipeline yet, for anyone** — a correct, intended consequence of the
population/publish separation, not a defect. Verified in
`__tests__/muv-ai-runtime/governed-intelligence-integration.test.ts` (10 tests): a real, unmocked
`buildIntelligence()` → `executePipeline()` → `buildExperienceResponse()` → `adaptForWebsite()` call
chain correctly returns empty retrieval, a conservative/no-crash execution outcome, zero leaked
internal reasoning, zero Ingredients/formula content, and a stable/deterministic result across repeat
calls — at real ANONYMOUS clearance (no mocking; `auth()` naturally resolves to `null` outside a real
request scope, verified empirically).

Safety classification (Priority/EQ/CQ engines) operates on the customer's own message text
independently of retrieval — verified working correctly (a message naming a hazard/danger term is
classified `SAFETY`/`URGENT` regardless of whether anything is retrievable yet).

## 2. Stage 5 — Governed tools, response validation, observability

**Commerce tools** (`commerce.getPricing`/`commerce.getAvailability`) are real, already-registered
(Phase 5.3), `GUEST_SAFE`-classified tools in `lib/gateway/security/tool-registry.ts` — confirmed to
exactly match the tool names Stage 2's population wrote into every `ProductIntelligence.sections.
variants[]` entry (zero drift). `getAvailability()` returns live data from `Product`/`ProductVariant`,
never from any intelligence table. `commerce-api.ts`'s own header comment states these tools are
"NOT wired into the live turn path... a later, separately-approved step (would mean touching the
Experience Orchestrator, which this phase's own rules forbid)" — this task's own "do not redesign the
architecture" instruction requires respecting that existing, explicit prior-phase decision, not
overriding it. Wiring remains unimplemented by design; the tools exist, are correctly classified, and
are ready for that separately-approved step.

**Response-validation contracts** are enforced structurally rather than by inspecting model output,
since no model is ever called: `buildExperienceResponse()`'s `CUSTOMER_MESSAGE_BY_ACTION` lookup table
is a small, fixed, exhaustively-enumerable set of strings — verified (test 5) that every one of the 9
possible `ActionType` values maps to a string containing no currency figure, no percentage, no
database-id-shaped token — i.e. it is structurally impossible for this path to hallucinate a price,
statistic, or leak an internal identifier, because there is no code path that ever interpolates
dynamic content into that string. Separately verified: no `ProductIntelligence.sections` ever contains
a raw `price`/`mrp`/`stock` field (dynamic commercial data stays tool-resolved, confirmed again here
independent of Stage 3's equivalent check).

**Observability:** every real retrieval call is captured in `KnowledgeRetrievalLog` with action,
resolved clearance, source types queried, match count, duration, and outcome (verified against a real
write). A genuine, documented gap: the log persists a match *count*, not the specific retrieved
record/version identities, and there is no persisted per-turn table for intent/confidence/decision on
the customer pipeline (Pipeline A — the internal Sales/Support/Founder AI — does persist this, via
`aiWorkflow`/`aiMessage`/`aiTelemetry`; Pipeline B does not). Closing this would require a
`GatewayObservabilityEvent.metadata` (an existing flexible JSON column — no migration needed) write
inside `instrumentGatewayTurn()`, which wraps every real production turn; given the size of that blast
radius and this task's narrow-scope mandate, this was documented rather than implemented. Flagged here
for Founder/independent-audit visibility.

## 3. Stage 6 — Provider-off runtime verification (not the final FAT)

22 deterministic tests in `__tests__/muv-ai-runtime/provider-off-verification.test.ts`, all passing,
against the real, unmocked runtime chain — covering the full required scenario list:

| # | Scenario | Result |
|---|---|---|
| 1 | Product availability | ✓ governed, no leakage |
| 2 | Price | ✓ |
| 3 | Product variant | ✓ |
| 4 | Directions | ✓ |
| 5 | Safety | ✓ correctly classified `SAFETY`/`URGENT` |
| 6 | Comparison | ✓ |
| 7 | Recommendation inputs | ✓ |
| 8 | Problem-based query | ✓ |
| 9 | Care workflow | ✓ |
| 10 | Nonexistent Product | ✓ zero retrieved knowledge, no fabrication |
| 11 | Unsupported claim | ✓ |
| 12 | Unsafe chemical mixing | ✓ `SAFETY`, conservative action chosen |
| 13 | Formula-extraction attempt | ✓ no leakage |
| 14 | Ingredients-extraction attempt | ✓ no leakage |
| 15 | Hindi | ✓ graceful, no crash, no fabrication |
| 16 | Hinglish | ✓ graceful, no crash, no fabrication |
| 17 | Multi-turn context | ✓ `conversationContext` correctly threaded |
| 18 | Angry/confused sentiment | ✓ classified from lexicon match; reasoning text explicitly disclaims "not a psychological or medical assessment" |
| 19 | Tool/source failure resilience | ✓ `Promise.allSettled` isolation confirmed — no crash |
| 20 | No-result fallback | ✓ empty retrieval, no fabricated content |
| 21 | Human escalation | ✓ `escalation.required` correctly propagates to `requiresHandoff` |
| 22 | External provider disabled | ✓ `GATEWAY_LLM_PROVIDER`/`LLM_PROVIDER` both unset |

Every scenario asserts the same governed-and-safe invariant set: no `ingredient`/`formula`/
`raw material` text anywhere in the customer-facing view, `reasoningTrace` never populated for this
caller, no currency figure ever rendered. No external AI provider is invoked anywhere in this suite —
confirmed both by the empty env vars and by the fact these are real, synchronous/deterministic
function calls with no network dependency.

## 4. What was verified vs. what remains a documented, out-of-scope gap

**Verified, working, real (not simulated):**
- Retrieval → Intelligence → Execution → Experience chain, end to end, against real populated data.
- Governance gate (unpublished DRAFT content invisible to every caller) holds under direct testing.
- Safety/priority/care classification from message text, independent of retrieval.
- Commerce tools exist, are correctly registered and named, return live (non-stale) data.
- Response composition is structurally hallucination-proof (fixed lookup table, no interpolation).
- Retrieval-call observability (`KnowledgeRetrievalLog`) captures the documented fields.
- Zero Ingredients/formula/raw-material leakage across all 21 scenarios.
- External AI provider remains fully disabled throughout.

**Documented, not implemented (deliberately, per narrow-scope safety mandate):**
- Wiring `lib/gateway/commerce/**`/`lib/gateway/knowledge/**` tools into the live Experience
  Orchestrator turn — explicitly deferred by the existing codebase's own prior-phase comment.
- Extending `GatewayObservabilityEvent.metadata` to capture per-turn intent/confidence/retrieved
  record identities — a real, closeable gap using an existing flexible column, deferred given its
  blast radius across every live production turn.
- Surfacing a retrieved intelligence version's actual authored content (not just its title) to the
  customer — a pre-existing architectural characteristic of the frozen rendering chain
  (`context-engine.ts` → `response-composer.ts` → `response-model.ts` →
  `website-channel-adapter.ts`), documented in Stage 3's report, unchanged here.

Both documented gaps require touching shared plumbing used by every real production turn; closing
them is a Founder/architecture decision for a future, separately-scoped task — not a decision to make
unilaterally inside a task whose explicit mandate is "do not redesign the architecture."

## 5. Gate — result

- Governed four-layer retrieval confirmed live and correctly ordered — ✓
- Dynamic price/stock data confirmed tool-resolved, never intelligence-cached — ✓
- Response-validation contracts hold structurally (no hallucination path exists) — ✓
- Observability captures the documented, currently-supported field set — ✓ (gap flagged, not hidden)
- Zero confidential/formula/Ingredients leakage across every scenario — ✓
- Safe fallback and escalation behavior confirmed — ✓
- External AI provider remains disabled — ✓
- No CUSTOMER_SAFE visibility change, no ProductContent approval change, no source-table mutation — ✓

**Stage 6 gate: PASSED.**
