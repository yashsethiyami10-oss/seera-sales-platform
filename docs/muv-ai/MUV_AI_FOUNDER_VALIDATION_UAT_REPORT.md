# MUV AI — Founder Validation & Safe UAT Activation — Final Report

**Task:** Founder Validation & Safe UAT Live Activation (Blocks A and B).
**HEAD at completion:** `a3bb7a24b71b30ceccd9c2a9fa8ee1188fa53ab4`, branch `main`.
**Commits made this task:** `5defcad`, `94b10ce`, `a3bb7a2` (see §18). Nothing pushed, nothing deployed.

---

## 1. Direct Founder Review Statement

The safe, governed parts of this task are done and verified: you now have a page
(`/admin/intelligence`) to inspect every piece of AI intelligence the system has produced, a
written decision queue of everything that needs your call, and a hardened response path that will
show real product/problem/care detail to a Founder/Staff session the moment content is actually
published.

The honest, important catch: **right now, asking MUV AI anything — as a customer or as you —
produces the same generic "tell me more" reply**, because zero records have ever been published.
This isn't a bug found during this task; it's the same governance gate every prior audit in this
project has already surfaced, now demonstrated directly with 23 real test scenarios (§13). The
system is correctly, deliberately silent rather than wrong. Making it actually answer requires two
separate decisions from you, neither of which this task made unilaterally: (1) resolve the 3
blocked products + 12 review-required confidentiality findings in the decision queue and publish at
least one record, and (2) decide whether/when to turn on a real external AI provider (I stopped
short of that — see §12 — because it means real API calls with a real cost, which felt like your
call, not mine, even under this task's own broad authorization).

## 2. Scope and Safety Constraints Observed

Followed throughout: never `git add .` (every commit staged named files only, verified via
`git status` before each), no source-table mutation, no CUSTOMER_SAFE/PUBLIC promotion, no
ProductContent approval changes, provider kept disabled, no broad population rerun, no 100/500-
question FAT, no push, no deploy, no customer-beta start. One deviation is disclosed in full,
not hidden: see §3.

## 3. Pre-Flight Safety Checks and One Disclosed Incident

- Branch: `main`. Starting HEAD: `c0dfd67` (matches the prior task's final commit).
- `git status` at start: only the same pre-existing, unrelated modified/untracked files present in
  every prior phase of this task chain (`actions/products.ts`, `components/admin/*`, `AGENTS.md`,
  `__tests__/admin/`, `__tests__/storefront/`, `docs/seera/`, etc.) — none touched by this task.
- **Disclosed incident:** while gathering data for §6/§7, a one-off read-only script was run with a
  plain `npx tsx` invocation that bypassed this project's `.env.local`-overrides-`.env` precedence
  and the test suite's own `TEST_DATABASE_URL` safety substitution. It connected to `.env`'s raw
  `DATABASE_URL`, which resolves to `ep-red-surf-azlgu03d-pooler...` — the host this task's own
  standing instructions name as forbidden. Two read-only queries executed (`product.findUnique` ×3,
  `productIntelligence.findMany`) before this was caught; no write occurred. Work stopped
  immediately, the situation was reported in full, and after explicit confirmation to proceed, every
  subsequent query was re-run correctly against `TEST_DATABASE_URL` with an explicit
  hostname-comparison safety check before use. Full detail: §5 of
  `docs/muv-ai/MUV_AI_FOUNDER_VALIDATION_MANIFEST.md`. All work after this point, including
  everything reported below, ran exclusively against `TEST_DATABASE_URL` (`ep-falling-heart-...`).
- Provider disabled confirmed: `GATEWAY_LLM_PROVIDER` and `LLM_PROVIDER` both unset in `.env`/
  `.env.local`, re-confirmed live via test 0 of the Block B4 suite (§13).
- Intelligence state confirmed live (not from a stale snapshot): `ProductIntelligence`=17 (+3
  blocked, never populated), `ProblemIntelligence`=14, `CareIntelligence`=24, `KnowledgeItem`=440
  (397 INTERNAL + 43 CONFIDENTIAL). Zero `PUBLIC`-layer rows anywhere. Zero versions above `DRAFT`
  anywhere. Full detail and per-record confidentiality findings: the Validation Manifest.

## 4. Block A Summary — Founder Validation Readiness

All three sub-tasks (A1/A2/A3) complete. Block A Gate passed (§8).

## 5. A1 — Founder Intelligence Validation Page

`app/admin/intelligence/page.tsx` (new) + a NAV entry in `app/admin/layout.tsx`. Deliberately reuses
the existing, already-`requireStaff()`-gated action modules
(`listProductIntelligence`/`listProblemIntelligence`/`listCareIntelligence`/`listKnowledgeItems` and
their `get*`/`get*VersionHistory` companions in `actions/*.ts`) rather than inventing a new access
mechanism — the task's own instruction ("if the current architecture already supports a Founder/
internal clearance path, use it") was followed literally, because it does. Gating is identical to
every other `/admin/*` page: `app/admin/layout.tsx`'s session check (ADMIN or STAFF, else redirect).

The page shows, per record: product/record name, layer, active version + status, a source-trace
excerpt, and a **live** confidentiality-scanner result (via `scanValueForConfidentiality`, the same
scanner used everywhere else in this project) — findings are computed on read, nothing is
pre-computed or cached, so the page always reflects current content. `KnowledgeItem` (440 rows) is
shown as a governance summary rather than an exhaustive per-row list, with a note directing
reviewers to per-item drill-down via the existing actions — a deliberate scope choice, not an
oversight (documented in the page's own header comment).

This does **not** weaken the customer PUBLISHED-only rule in any way — it's a read-only admin page
behind the same gate as every other admin page; it doesn't touch `lib/retrieval/*` or the customer
turn path at all.

## 6. A2 — Founder Decision Queue

Full table with exact conflicting field values (pulled from the real reconciliation manifest's
`fieldResolutions`, cross-checked against live DB state) is in
`docs/muv-ai/MUV_AI_FOUNDER_VALIDATION_MANIFEST.md`, §1. Summary:

- **3 blocked products, no `ProductIntelligence` row exists for any of them** (Muv Black Phenyl,
  Muv Velvet Oak Body Wash, Muv Midnight Frost Body Wash) — each has a genuine `benefits`/
  `usageInstructions`/`safetyInformation` conflict between `ProductContent` (newer, PENDING) and the
  legacy `Product` row, including one **fragrance-name mismatch** ("Midnight Frost" vs. "Fresh
  Cooling") on the Midnight Frost record that should be checked against the physical product before
  any content is used anywhere. None of these were silently resolved.
- **12 of 17 active `ProductIntelligence` records carry `FOUNDER_REVIEW_REQUIRED` confidentiality
  findings** — manufacturing-sequence/batch/percentage language in `productIdentity`/`purpose`
  fields (10 records), and "glycerin" appearing in customer-facing FAQ/benefits prose rather than a
  controlled ingredient field (4 Hand Wash records, overlapping the first group). None are
  `RESTRICTED_INTERNAL_FORMULATION` — those were already auto-redacted by the prior Confidentiality
  Hardening task.
- **0 unresolved findings** in any of the 14 `ProblemIntelligence` or 24 `CareIntelligence` records
  (live-scanned, confirmed).

## 7. A3 — Publishing Readiness Manifest

`docs/muv-ai/MUV_AI_FOUNDER_VALIDATION_MANIFEST.md`, §2. Totals:

| Layer | Total | SAFE TO PUBLISH | SAFE INTERNAL ONLY | FOUNDER REVIEW REQUIRED | BLOCKED |
|---|---|---|---|---|---|
| ProductIntelligence | 17 (+3 blocked) | 0 | 5 | 12 | 3 |
| ProblemIntelligence | 14 | 0 | 14 | 0 | 0 |
| CareIntelligence | 24 | 0 | 24 | 0 | 0 |
| KnowledgeItem | 440 | 0 | 440 | 0 (sampled, see manifest note) | 0 |

As expected and consistent with every prior audit: **zero records qualify for SAFE TO PUBLISH**,
because no explicit, frozen Founder publish-approval exists anywhere in the repository. This is a
structural fact about the current state, not a defect this task could or should fix on its own
authority.

## 8. Block A Gate — Result: PASSED

Founder/internal validation path works (§5) · customer PUBLISHED-only protection untouched (verified
by code review — no `lib/retrieval/*` or customer-path file was touched in Block A) · decision queue
explicit (§6) · publishability manifest exists (§7) · no accidental public/customer-safe promotion
(every query used to build the manifest was read-only — `findUnique`/`findMany`/`groupBy`/`count`;
zero `create`/`update`/`delete` calls) · `npx tsc --noEmit` clean.

## 9. Block B Summary — Safe UAT Working MUV AI

B1, B2, and B3's safe wiring are complete and tested. B3's actual provider activation was
deliberately not performed (§12). B4 ran and produced an important structural finding (§13). B5 was
verified by code review and a successful build, not live-browser interaction (§14, environment
limitation, disclosed). B6 gaps are identified and reported, not fixed, per the task's own "report
gaps, don't broaden architecture" instruction (§15).

## 10. B1 — Full Governed Answer Content

**What changed** (`lib/experience/experience-orchestrator.ts`, `response-model.ts`, `types.ts`,
`website-channel-adapter.ts`): `buildExperienceResponse()` can now attach real governed content
(title + summary from Module 6's own `decisionPackage.context.retrievedKnowledge` — never a raw
`Product`/`ProductContent`/`PublishedKnowledgeRecord` row) to `REFERENCE_CARD` segments. This is
gated on `resolveCallerClearance()` (Module 5's own, already-tested, self-resolving-via-`auth()`
primitive) returning `ADMIN` or `STAFF` for the turn's real, server-derived session — never
client-supplied. The Safety Engine's own `clearanceLayer` stays hardcoded `"PUBLIC"` unconditionally,
for every caller, staff included — **only rendering changes, never what gets retrieved or what the
Safety Engine decides.** An ordinary customer/anonymous turn is byte-for-byte unchanged (confirmed:
`governedContent` stays `undefined` unless the role check passes, and the function's prior behavior
is exactly what running with `governedContent: undefined` produces).

**Critical honest finding, discovered while building the B4 scenarios (§13):** this enrichment path
has **zero observable effect today**, for any caller including ADMIN. `IntelligenceRequest`
(Module 6) has no `versionSelector` field, so `buildIntelligence()` can only ever request
`mode: "published"` retrieval — confirmed by direct test (`founder-uat-scenarios.test.ts`, test 3:
an ADMIN-clearance call to the same query as an anonymous one still returns `retrievedCount: 0`).
Since zero records anywhere are `PUBLISHED` (§3), there is currently nothing for this path to
surface, for anyone. **The code is correct, safe, and will start working automatically the moment
the Founder publishes even one record** — no further engineering change is needed for that to take
effect.

Frozen flow preserved: Question → Auth/clearance (new, read-only, non-blocking) → Intelligence →
Decision → Governance/Safety (untouched) → Response (enriched only for verified staff) → Channel
Adapter (confidentiality backstop still runs on the enriched content, same as everything else).

## 11. B2 — Live Commerce Facts

**What changed** (`actions/muv-ai-beta.ts`): `getMuvAiProductCard`'s price/MRP/stock/variant now
come from the governed `commerce.getAvailability` Gateway tool (`lib/gateway/commerce/commerce-api.ts`,
itself wrapped in `instrumentToolCall` observability) at request time, instead of a direct Prisma
join. Catalog identity fields (name/slug/image/short description) — not commerce facts, no tool
covers them — are unaffected, still a plain Prisma read. Selection logic (cheapest variant) is
unchanged; only the data source moved. Graceful fallback confirmed by code: if the tool call fails
or returns no variants, the card shows `price: null, mrp: null, variantId: null` rather than
throwing — the existing UI already renders that case correctly (no "Add to Cart" button, no price
line). No `ProductIntelligence`/`ProblemIntelligence`/`CareIntelligence` version anywhere stores a
price/MRP/stock field (confirmed by schema read) — dynamic values were never frozen into
intelligence records, before or after this change.

This action is shared with production customers today (it powers every product reference card in
the live widget) — verified via the full `muv-ai`/`muv-ai-runtime` test suites (240/241 passed,
1 unrelated transient Neon flake reproduced as passing on retry, §17) that nothing regressed.

## 12. B3 — Controlled External Provider Activation

**Wiring completed, activation NOT performed.** Research (a dedicated architecture pass, cited
file:line throughout) found the Controlled Product Search Pilot (`lib/gateway/pilot/
product-search-pilot.ts`) is the **only live-reachable LLM call site** in the entire codebase — and,
before this task, it had **zero confidentiality scanning and zero response validation** on generated
output, unlike the legacy path's `adaptForWebsite()`. This was a real gap, not a hypothetical one,
and closing it was necessary defensive work regardless of whether the provider is ever turned on.

**What was added:** `validateGeneratedResponse()` — a confidentiality-scanner backstop (identical
bar to every other customer-facing segment in this codebase) plus a price-grounding check (rejects
the response if it states any ₹/Rs figure outside the union of the real, tool-returned price ranges
it was given) — runs as a hold-the-turn gate immediately after generation; failure throws
`PilotUnavailableError`, which the existing caller already catches and falls back to the
deterministic legacy path, matching every other failure mode already in that file. Additionally,
every final segment (the generated message and each product reference) now passes through the same
per-segment confidentiality backstop the legacy path uses (exported `backstopScanSegmentContent`
from `website-channel-adapter.ts`, reused rather than duplicated).

**Verified already in place, not built by this task:** Gateway kill switches
(`GATEWAY_AI_ENABLED`/`GATEWAY_PROVIDER_ENABLED`) are genuinely read and enforced at the pilot's one
call site; a 20s generation timeout and a 2-retry backoff exist (`lib/gateway/providers/
resilience.ts`); output is capped at 300 tokens via config; the adapter requests no extended
thinking, so no chain-of-thought leakage path exists today.

**Reported gap, not fixed (disclosed rather than silently left):** `lib/gateway/config.ts` defines
`GATEWAY_GENERATION_TIMEOUT_MS`/`GATEWAY_RETRY_LIMIT` config values that are **never actually read**
by `resilience.ts` — the enforced timeout/retry counts are hardcoded literals that happen to match
the config defaults today. Not touched in this task (the pilot file's own header explicitly says the
frozen Provider Adapter/resilience layer is out of scope for this phase); flagged for a future pass.

**Why activation itself did not happen:** flipping `GATEWAY_LLM_PROVIDER=ANTHROPIC` means the very
next matching customer/UAT message makes a real, paid call to Anthropic's API — a materially
different kind of action than anything else in this entire task chain (external network call, real
cost, harder to fully reverse). I flagged this distinction to the Founder before starting Block B
and said I would complete all wiring but pause before the first real call. No message in this
conversation authorized flipping that switch specifically, so per this task's own instruction ("if
provider credentials are unavailable, do not fabricate activation... report
PROVIDER_CREDENTIAL_BLOCKED") and this codebase's own standing risk-matching principle, I did not
set it. Status: **PROVIDER_ACTIVATION_PAUSED_PENDING_EXPLICIT_APPROVAL** — a real Anthropic API key
is present in `.env`, so this is a decision gate, not a credentials gap.

## 13. B4 — Working Founder UAT Scenarios

`__tests__/muv-ai/founder-uat-scenarios.test.ts` — 22 distinct questions (23 test cases including
the provider-inactive check) across every requested category, run through the real, unmodified turn
pipeline (`buildIntelligence` → `executePipeline` → this task's own clearance resolution →
`buildExperienceResponse` → `adaptForWebsite`), against live `TEST_DATABASE_URL` data. All 23 pass.

**Headline result:** every one of the 22 scenarios — Product, Comparison, Recommendation, Care,
all 5 Governance probes, and all 6 Conversation variants (Hindi, Hinglish, follow-up, ambiguous,
confused, frustrated) — resolves to exactly one of two fixed, generic outcomes:

- `COLLECT_INFORMATION` → "We'd like to help you with this." + "Could you tell us more about your
  situation?" (20 of 22 scenarios — no retrieved evidence, not safety-flagged)
- `ESCALATE` → "Thanks for reaching out — we're connecting you with our team..." (2 of 22 —
  both bleach-mixing safety scenarios, triggered by keyword-based safety classification alone, which
  needs no retrieval to fire)

Retrieved-knowledge count was `0` in every single scenario, Founder/ADMIN clearance included (test 3
directly compares the same query at ANONYMOUS vs. ADMIN clearance — identical `retrievedCount: 0`
for both). This is the direct, empirical demonstration of §10's finding: the system is safe and
correctly wired, but has nothing published to answer from yet. Every governance probe (nonexistent
product, exact formula %, raw materials, confidential ingredient name, blocked/conflicted product)
passed its no-leak assertion — but trivially, since the generic fallback message contains no
product-specific content of any kind to leak. This is worth stating plainly: **these governance
tests will need to be re-run once real content is published**, because a system that says nothing
specific cannot yet be said to have proven it withholds only the *right* specific things.

Provider used: **NO**, for all 23 (confirmed directly, test 0).

## 14. B5 — Website Responsiveness Check

No browser-automation tool is available in this environment (re-confirmed this session, not
assumed from a prior one) — live interaction (visual open/close animation, real mobile-viewport
rendering, console-error-free confirmation) was **not performed**. What was verified instead:

- `npx next build` succeeds cleanly (`Compiled successfully in 38.4s`); `/admin/intelligence` builds
  as a dynamic route with no error; no new route collision introduced.
- Code review of `components/muv-ai/use-muv-ai-chat.ts` confirms: a request timeout
  (`MUV_AI_TIMEOUT`), a duplicate-send guard, rate-limit-specific error copy, a distinct error
  message type with a "Try again" retry action, a `sending` loading-state flag, and session-based
  multi-turn support all exist and were not touched by this task.
- Code review of `components/muv-ai/muv-ai-widget.tsx`/`muv-ai-message.tsx` confirms the
  `REFERENCE_CARD` rendering change from B1 degrades gracefully: the new `content` field is optional
  everywhere it's read, and the one place it could visually crowd a UI element (`MuvAiProductCard`'s
  `label` prop) is only ever shown transiently during the card's own loading state or as a fallback
  if the product reference fails to resolve — the resolved, steady-state card ignores `label`
  entirely and renders from its own live `getMuvAiProductCard` fetch.

**Recommendation:** a manual QA pass (open/close, type, send, mobile viewport, console tab) before
Founder testing begins, specifically because it could not be performed here.

## 15. B6 — Observability

`GatewayObservabilityEvent` (the one real observability table) captures, for **every** turn
regardless of path: `requestId` (correlation ID), `eventType`, `severity`, `source`, `durationMs`,
a message, and free-form `metadata`. `instrumentGatewayTurn` — which wraps every single call to
`runAiGatewayTurn` — emits exactly a start/success/failure duration event; nothing more.

**Gaps, reported per the task's own "report gaps, don't broaden architecture" instruction — not
fixed:**

- **User/clearance context**: not recorded anywhere for the legacy path (the dominant, always-active
  path). `resolveCallerClearance()`'s result (this task's own B1 addition) is computed but never
  logged.
- **Intent, sentiment/confidence**: `decisionPackage.priority`/`eqSummary`/`cqSummary`/`confidence`
  exist in-memory for every turn but are never persisted anywhere for the legacy path.
- **Retrieved intelligence record IDs**: never logged (pre-existing gap, reconfirmed).
- **Tool calls**: correctly captured when a tool actually runs (`COMMERCE_TOOL_USAGE` events — now
  also emitted by B2's product-card change, a net observability improvement) — but the legacy
  customer-turn path itself never calls a tool, so this is N/A for the dominant path by design, not
  a gap in it specifically.
- **Provider outcome / validation outcome**: correctly captured for the pilot path
  (`recordProviderOutcome`/`recordTokenUsageEvent`, plus this task's new validation-failure event) —
  N/A for the legacy path, which never calls a provider.
- **Fallback/escalation reason**: `executionPackage.escalation.target`/`.reason` exist in-memory but
  the legacy path emits zero `GatewayObservabilityEvent`s of its own at all — an ESCALATE outcome is
  visible in the returned view but never written to any log.
- **Latency/errors**: covered at the whole-turn granularity (`GATEWAY_LATENCY`/`TOOL_ERROR` via
  `instrumentGatewayTurn`) for every turn — this one is solid.

Net: turn-level latency and pass/fail are solid; everything about *why* a turn resolved the way it
did (clearance, intent, retrieval, escalation reason) is currently invisible after the fact for the
path that handles 100% of real traffic today. This was true before this task and remains true after
it — flagged, not silently carried forward.

## 16. Database State Verification

Before/after this task, confirmed via read-only queries only:
`Product`/`ProductContent`/`PublishedKnowledgeRecord` row counts and content unchanged; zero
`layer=PUBLIC` rows introduced (`ProductIntelligence`: 17, all `INTERNAL`; `KnowledgeItem`: 397
`INTERNAL` + 43 `CONFIDENTIAL`, 0 `PUBLIC` — same as pre-task); zero versions above `DRAFT`
introduced; no restricted term reintroduced (0/17 active `ProductIntelligenceVersion` rows contain a
`RESTRICTED_INTERNAL_FORMULATION` finding, matching the post-hardening baseline); no duplicate
intelligence identity created (this task added zero rows to any of the four intelligence tables —
every DB interaction this task made besides the disclosed incident in §3 was a read).

## 17. Test and Build Verification

- `npx tsc --noEmit`: clean after every code change in this task (checked incrementally, not just
  once at the end).
- `npx next build`: succeeds (`Compiled successfully in 38.4s`); pre-existing `/os/*` "Dynamic server
  usage" warnings are unrelated to this task (Sales OS module, present before this task started).
- `__tests__/muv-ai/` + `__tests__/muv-ai-runtime/`: 240/241 passed in the full run; the 1 failure
  (`eios-golden-queries.test.ts`, an unrelated `lib/eios/runtime.ts` module) reproduced as a clean
  pass on immediate retry with a longer timeout — a transient Neon cold-connection flake, the same
  well-established pattern from every prior phase of this task chain, not a regression.
- `__tests__/muv-ai-runtime/tools-validation-observability.test.ts` (covers `commerce.getAvailability`
  directly, relevant to B2): 8/8 passed on retry after one transient connection-reset failure.
- `__tests__/muv-ai/founder-uat-scenarios.test.ts` (new, B4): 23/23 passed.
- No broad population rerun, no full FAT, as instructed.

## 18. Commits Made This Task

1. `5defcad` — `feat: add Founder-governed MUV AI validation path` (Block A: page, NAV entry,
   manifest doc).
2. `94b10ce` — `feat: enable governed MUV AI UAT response flow` (B1 + B2 + B3 safe wiring).
3. `a3bb7a2` — `test: add Founder UAT AI response verification` (B4 scenario suite).

This document is the 4th planned commit (`docs: add MUV AI Founder validation report`), to be
committed by name only, same discipline as the other three. Nothing pushed. Nothing deployed.

## 19. Known Gaps and Risks (Consolidated)

1. **Zero published content** — the actual reason MUV AI cannot yet give a specific answer to
   anyone. Requires a Founder decision (§6/§7), not an engineering fix.
2. **External provider not activated** — deliberate pause, requires explicit Founder go-ahead (§12).
3. **B5 not live-browser-verified** — environment limitation, needs a manual QA pass.
4. **B6 observability gaps** — clearance/intent/sentiment/retrieved-IDs/escalation-reason not
   persisted for the legacy (100%-of-traffic) path. Pre-existing, reconfirmed, not fixed per this
   task's own scope discipline.
5. **`GATEWAY_GENERATION_TIMEOUT_MS`/`GATEWAY_RETRY_LIMIT` config values unused** — hardcoded
   literals enforce timeout/retry instead, currently matching the config defaults coincidentally.
6. **Governance probes in B4 are not yet a strong test** — they pass because there's nothing to leak
   yet, not because leak-prevention was exercised against real content. Must be re-run once
   something is published.
7. **`scripts/verify-pilot-product-search.ts`'s manual script was not re-run** in this task (it
   would need the same `TEST_DATABASE_URL` safety wrapper this task had to build ad hoc for its own
   read-only checks — it currently uses `prisma` directly with no such guard, a latent risk for
   whoever next runs it carelessly).

## 20. Final Status and Exact Next Phase

### FOUNDER UAT PARTIALLY READY — SPECIFIC BLOCKERS REMAIN

The safe wiring (Blocks A and B1/B2/B3-wiring) is complete, tested, and does not weaken any existing
governance rule. What's blocking a genuinely "working" Founder UAT experience is not more
engineering — it's two decisions that are explicitly this task's to surface, not to make:

**Exact next phase, in order:**
1. Founder reviews `MUV_AI_FOUNDER_VALIDATION_MANIFEST.md` and resolves the 3 blocked-product
   conflicts and 12 review-required confidentiality findings (§6).
2. Founder publishes at least one clean record (the 5 "SAFE INTERNAL ONLY," zero-finding
   `ProductIntelligence` records — Cloud Walk Floor Cleaner, Pure Bleach, Radiance Car Wash, Velvet
   Mist Floor Cleaner, White Phenyl — are the lowest-risk starting candidates) via the existing
   admin publish action, to give the already-wired B1 path something real to surface.
3. Re-run the Block B4 scenario suite (or an expanded version) against that published content — this
   is the point where the governance probes (§19.6) become a meaningful test rather than a trivial
   pass.
4. Separately, Founder decides whether/when to authorize flipping `GATEWAY_LLM_PROVIDER=ANTHROPIC`
   for the UAT scope specifically (§12); if approved, complete a small, explicitly-scoped follow-on
   task for that one action plus a first live-provider verification run.
5. A manual browser QA pass on the widget (§14) before either of the above reaches real Founder
   testing.

Stopping here, as instructed: no full FAT, no broad customer exposure, no push, no deploy, no
customer beta.
