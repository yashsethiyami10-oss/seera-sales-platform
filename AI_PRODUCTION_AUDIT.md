# MUV AI Gateway — Final Production Audit (AI Production Rollout v1.0)

Read-only audit. No code changes in this document. Findings are classified:
**Launch blocker** / **Must fix immediately** / **Should fix after launch** /
**Safe backlog** / **Accepted v1 limitation**.

---

## 1. Architecture integrity / canonical path

The canonical path is real and unbroken: Storefront widget → `orchestrateExperience`
Server Action (`actions/experience.ts`) → `runAiGatewayTurn` (`lib/gateway/ai-gateway.ts`,
frozen, untouched) → Experience Orchestrator (`lib/experience/experience-orchestrator.ts`,
extended only through its own existing branch-and-fallback pattern) → Security Dispatcher
(`invokeGatewayTool`, frozen) → Commerce Intelligence (`searchProducts`) → grounded
provider response → storefront reply. No direct UI-to-provider call, no direct
UI-to-database call, no tool bypass around `invokeGatewayTool` anywhere in this
rollout's own code (verified by code review of every new file; no new file imports
`@/lib/prisma` from a client component or calls `getGatewayProviderAdapter()` from
anywhere except `lib/gateway/config.ts`'s wrapper and the pilot).

Frozen contracts (Gateway, Provider Adapter, Knowledge API, Knowledge Publisher,
Commerce/Customer/Conversation Intelligence, Security, Observability) were extended
only through existing extension points: new rollout flags, a new kill-switch
wrapper, one optional trailing parameter on `searchProducts`, one new observability
event using the existing event-type vocabulary. No frozen file's exported function
signature changed. **Assessment: sound. No finding.**

## 2. Provider integration

Real, working, verified against a live Anthropic endpoint multiple times across
this rollout (Phase 6.0/6.1 sign-off, Stage 7 markdown fix, Stage 12 multi-turn
fix). One real bug found and fixed in this rollout's own code (never in the
frozen adapter): `temperature` is deprecated for the configured model — removed
from the pilot's own `generate()` call.

- **Accepted v1 limitation:** no real token-by-token streaming (Stage 7). Server
  Actions have no partial-response channel back to the client without a genuine
  new architectural piece (a streaming Route Handler) — building that was judged
  higher-risk than the "extend only through existing extension points" instruction
  allows for this rollout. Retry/regenerate exist in the Conversation Runtime
  library but aren't reachable from the live turn for the same reason streaming
  isn't — the UI's own retry button already re-runs the whole turn, which is a
  real, working substitute UX, just not the library-level retry/regenerate.

## 3. Knowledge governance

The one repository genuinely missing a Founder-reviewed customer-visibility
decision (the 1,187-KO file-backed Knowledge Factory) now has a real, generated
manifest (`KNOWLEDGE_CLASSIFICATION_MANIFEST.md`/`.json`): 1,092 not-yet-approved,
13 Founder-only, 33 Institutional Sales, 73 gap records, 7 risk-flagged, and
exactly 2 genuine customer-safe candidates — both still require explicit Founder
review. Zero automatic promotion; verified that building the manifest has no
effect on real enforcement. Customer AI grounds only in live Commerce data, never
Knowledge Factory content. **No finding — working as designed.**

## 4. Commerce grounding / customer ownership

Every commercial fact in every generated reply is traceable to a real tool
result — verified repeatedly against direct DB queries, including the live
multi-turn price-comparison case in Stage 12. Customer ownership (`getOrderById`/
`getOrderTimeline`) confirmed at the source-code level: a non-owner and a
nonexistent order id produce the identical `NotFoundError`, never disclosing
which. **Should fix after launch:** true cross-customer ownership isolation with
two real live sessions was never exercised end-to-end (only guest-denial and a
source-level confirmation) — no standalone script can hold two real authenticated
sessions; this needs a real two-account browser test, not a unit test.

## 5. Conversation runtime

Real multi-turn context works — verified live, not just unit-tested: "Do you
have a floor cleaner?" then "Which one is cheaper?" produced a correct, grounded,
price-accurate comparison using genuine session memory (Stage 12). Session
continuity/persistence/recovery/expiry all pre-existed via the frozen
`ExperienceSession` and were confirmed unchanged.

- **Must fix before wider promotion (not a launch blocker for Product Search
  itself):** the pilot's intent classifier only ever resolves to
  `commerce.searchProducts`. Every other Wave A/B/Customer tool enabled in
  Stages 4–5 is dispatcher-reachable and fully tested at that layer, but there is
  no conversational path to them. Pre-existing UI chips ("Compare Products",
  "Ingredients", "Directions", "Safety", "Show Similar Products") currently fall
  through to a generic product search and typically return a "no verified match"
  clarification instead of their intended specialized answer. This predates this
  rollout (the chips were built for a future, fuller AI system) but is now more
  visible since Product Search itself is live. Recommend either hiding those
  specific chips until a real intent-routing expansion ships, or prioritizing
  that expansion next.

## 6. Streaming / responsive UI

Markdown rendering fixed (real bug: literal `**asterisks**` shown instead of
bold) — new, dependency-free, JSON-injection-free renderer, verified via
`react-dom/server` (11 checks) and live in both desktop and real mobile-viewport
(390×844) browser sessions. No layout regression observed. Real streaming: see
§2's accepted limitation.

## 7. Security

Adversarial-tested, not just documented: a prompt injection cannot reach an
additional tool (structurally — there is no code path from customer text to a
tool name at all beyond the one fixed tool), cannot leak the system prompt or a
configured secret, cannot reach restricted Knowledge Factory content. SQL-
injection-shaped input verified harmless end-to-end (Prisma parameterizes every
query; the real products table was confirmed unaffected). Provider 401/403/429/
503/malformed-response handling verified via a temporary `fetch` mock, without
touching the frozen adapter. **No finding.**

## 8. Observability / operations

New `/admin/analytics/ai-gateway` page (Stage 9): success/fallback rate, p95
latency, per-source breakdown, real token totals, most-used tools, customer
feedback, kill-switch state, health checks — gated by the same middleware ADMIN/
STAFF check every other `/admin` page relies on. Cost estimation is honest:
reports "Not configured" rather than a fabricated per-token price.

- **Safe backlog:** no external alerting is wired to the dashboard's numbers —
  thresholds are documented in `AI_GATEWAY_PRODUCTION_RELEASE.md` but not
  connected to a paging system. This is genuinely outside this codebase's own
  scope (no existing alerting integration to extend) and belongs to whatever
  the Founder's ops stack already uses.

## 9. Performance / reliability

Real, measured (not estimated) improvement: an in-memory 5s candidate cache
dropped repeated search latency from ~594ms to ~1ms per call (excluding one
cold-start call each), never risking stale price/stock (structurally excluded
from the cache). A real 15-way concurrent burst test surfaced a genuine finding:
Neon's pooled connection limit, not application code, is the dominant latency
factor under concurrent AI traffic (~11s for 15 concurrent calls vs. ~600ms
alone).

- **Should fix before high-traffic production rollout:** connection-pool sizing
  needs review (e.g., Prisma's connection limit / Neon plan tier) before
  expanding past the "small percentage" rung of the rollout ladder in
  `AI_GATEWAY_PRODUCTION_RELEASE.md`. Not a launch blocker for an internal-only
  or low-percentage release, which is exactly what that document's rollout
  ladder already defaults to.

## 10. Costs

Token usage is real and recorded per turn. Dollar-cost estimation is honestly
gated on Founder-confirmed pricing (`GATEWAY_PROVIDER_INPUT/OUTPUT_PRICE_PER_1K`)
— **Must fix before relying on the cost dashboard:** set real, current Anthropic
pricing for the configured model in production; until then the ops dashboard
correctly shows "Not configured" rather than a guess.

## 11. Deployment configuration

Fully typed, documented, defaults-safe (`lib/gateway/config.ts`, `.env.example`).
Three independent emergency kill switches, each verified via a real dispatcher
denial, not just a unit test of the boolean. Progressive rollout (percentage +
allow-list) is coded and wired (Stage 13) but has never run against a real
production deploy, because none exists in this environment.

- **Launch blocker (external, not engineering):** no production hosting
  credentials were available in this session. `AI_GATEWAY_PRODUCTION_RELEASE.md`
  is the exact, ready-to-execute checklist; executing it is a human/ops action
  this agent cannot perform.

## 12. Technical debt (consolidated)

1. Intent routing covers only Product Search (§5) — Should fix before wider promotion.
2. Real streaming/retry/regenerate not wired into the live turn (§2) — Accepted v1 limitation.
3. Connection-pool sizing under concurrent load (§9) — Should fix before scaling past low-percentage rollout.
4. Provider cost pricing unset (§10) — Must fix before trusting the cost dashboard.
5. No external alerting wired to dashboard thresholds (§8) — Safe backlog.
6. Cross-customer ownership isolation not proven with two live sessions (§4) — Should fix after launch.
7. Percentile latency uses a bounded in-memory sort, not a real DB percentile aggregate (§9, noted in `metrics.ts`) — Safe backlog, revisit if traffic volume grows materially.

## 13. Rollback / incident readiness

Three env-var-only kill switches (no code rollback, no migration reversal) —
verified via real dispatcher denial. Documented explicitly in
`AI_GATEWAY_PRODUCTION_RELEASE.md`. **No finding.**

## 14. Documentation / test durability

19 permanent `scripts/verify-*.ts` suites, 510 checks, all passing, none making a
real billable call (the one genuine Anthropic-backed proof per phase was always a
separate, explicitly one-off, non-permanent script or a real browser session,
consistent with this project's own established discipline). Every stage has its
own commit with a full rationale. This audit and
`AI_GATEWAY_PRODUCTION_RELEASE.md` are the durable record going forward.

---

## Launch-blocker summary

Exactly one launch blocker, and it is external: **no production deployment
credentials in this environment.** Zero launch blockers in the engineering
work itself.
