# MUV AI Gateway — Controlled Production Release Checklist

This is Stage 13 of AI Production Rollout v1.0. It assumes the app is
already deployed and running in production by the existing process
(`DEPLOYMENT_GUIDE.md` / `DEPLOYMENT_READINESS.md`) — this document only
covers the AI Gateway's own cutover, layered on top of that.

**This document exists because I (the agent that executed Stages 1–12) have
no production hosting credentials, no Vercel/Railway/GoDaddy access, and no
way to set a real production environment variable in this session.**
Everything through Stage 12 — every line of code, every permanent test (510
checks across 19 suites, all passing), the search/grounding/security/
observability work, and the live-staging verification (a real Anthropic
call, a real multi-turn conversation, a real mobile session) — is complete
and committed. **Deployment execution itself is the one remaining external
blocker**, not a gap in the engineering work.

---

## 0. What "production release" means for this rollout today

Only ONE customer-facing capability exists end-to-end: **Product Search**,
via `commerce.searchProducts`, routed through the pilot
(`lib/gateway/pilot/product-search-pilot.ts`). Wave A/B Commerce tools and
all Customer Intelligence tools are enabled in the allow-list (Stages 4–5)
and fully tested at the dispatcher layer, but the pilot's own intent
classifier does not yet route conversational text to them — see
`AI_PRODUCTION_AUDIT.md` for the full, itemized list. Releasing today means
releasing Product Search to real customers, progressively. Nothing else
should be described as "released" until a future stage wires it into an
actual conversational path.

---

## 1. Required production environment variables

Set these on the real hosting platform (Vercel/Railway/GoDaddy env config —
never commit them):

| Variable | Value for this release | Why |
|---|---|---|
| `ANTHROPIC_API_KEY` | the real production key | already required for any Anthropic call |
| `GATEWAY_LLM_PROVIDER` | `ANTHROPIC` | activates the Provider Adapter (inert until this is set) |
| `FEATURE_PILOT_PRODUCT_SEARCH_ENABLED` | `true` | activates the pilot branch in the Experience Orchestrator |
| `GATEWAY_ENVIRONMENT` | `production` | powers `assertGatewayEnvValid()`'s production-only checks and the ops dashboard's environment label |
| `GATEWAY_ROLLOUT_PERCENTAGE` | `0` at first — see the rollout ladder below | the real progressive-release lever |
| `GATEWAY_INTERNAL_ALLOWLIST` | founder/staff customer IDs or emails, comma-separated | lets internal testers in regardless of percentage |
| `GATEWAY_AI_ENABLED` / `GATEWAY_PROVIDER_ENABLED` / `GATEWAY_TOOLS_ENABLED` | `true` (default) | leave as default; these are the emergency kill switches, not release levers |

Optional but recommended before this release:
- `GATEWAY_PROVIDER_INPUT_PRICE_PER_1K` / `GATEWAY_PROVIDER_OUTPUT_PRICE_PER_1K` — set these to Anthropic's real, current published price for the configured model so the ops dashboard's cost estimate stops reporting "Not configured." (Deliberately left unset by this rollout — no fabricated number.)

Run `assertGatewayEnvValid()` (or just load `/admin/analytics/ai-gateway`) immediately after setting these — it will flag a selected-but-unconfigured provider before any customer traffic sees it.

---

## 2. Progressive rollout ladder

Using `GATEWAY_ROLLOUT_PERCENTAGE` + `GATEWAY_INTERNAL_ALLOWLIST`
(`lib/gateway/config.ts`'s `isRolloutEligible()`, wired into the
Experience Orchestrator's pilot branch in Stage 13):

1. **Internal only.** `GATEWAY_ROLLOUT_PERCENTAGE=0`, `GATEWAY_INTERNAL_ALLOWLIST` set to the Founder's/staff's real customer IDs. Only those exact identities reach the pilot; every other visitor gets the unchanged legacy experience. Verify a real Anthropic call and a real observability event appear on `/admin/analytics/ai-gateway` for an allow-listed session.
2. **Small percentage.** `GATEWAY_ROLLOUT_PERCENTAGE=5`. Bucketing is deterministic per identifier (same customer/session always lands on the same side), so this is a stable 5% of traffic, not a coin flip per request. Watch the ops dashboard for one full day: success rate, fallback rate, p95 latency, token cost.
3. **Expand.** 25% → 50% → 100%, each held for at least a day, each gated on the previous step's dashboard numbers staying healthy (no material fallback-rate increase, no p95 latency regression, no unexpected cost spike).
4. **100%.** Remove the allow-list restriction (or leave it — harmless at 100%).

At every step, product/commerce read capability is already all that's live (there is no customer-data capability reachable via chat yet — see §0), so "product/commerce tools first, authenticated customer tools second" from the original instruction is satisfied by the current architecture itself, not by a separate step.

---

## 3. Pre-flight checks (run these against the real production build before step 1)

```bash
npm install
npx prisma generate
npx tsc --noEmit
npm run build
npm run verify:knowledge-publisher
npm run verify:knowledge-access
npm run verify:commerce-intelligence
npm run verify:customer-intelligence
npm run verify:conversation-runtime
npm run verify:observability
npm run verify:security
npm run verify:live-activation
npm run verify:pilot-product-search
npm run verify:gateway-config
npm run verify:knowledge-governance-manifest
npm run verify:search-intelligence
npm run verify:commerce-wave-rollout
npm run verify:customer-wave-rollout
npm run verify:security-hardening
npm run verify:observability-operations
npm run verify:search-performance
npm run verify:failure-abuse
npm run verify:muv-ai-markdown
```
All 19 suites (510 checks) must pass against the real production database before step 1 of the rollout ladder. None of them make a real Anthropic call — they're safe to run against production data.

Then, manually, exactly once: send one real message ("Do you have a floor cleaner?") through the real production URL as an allow-listed internal tester, and confirm a normal, grounded, correctly-priced reply — the same proof done in staging (see `AI_PRODUCTION_AUDIT.md`), now against the real environment.

---

## 4. Emergency rollback procedure

Three independent levers, in order of how surgical they are:

1. **Kill the AI layer only:** set `GATEWAY_AI_ENABLED=false`. Every customer instantly gets the pre-existing deterministic experience again. No deploy needed if the hosting platform supports live env var changes without a rebuild (Vercel/Railway do); otherwise it's a one-line env change + redeploy.
2. **Kill the provider only:** set `GATEWAY_PROVIDER_ENABLED=false`. Tool-grounded deterministic behavior (ambiguous/no-result clarifications) keeps working; only live generation stops.
3. **Kill all Gateway tools:** set `GATEWAY_TOOLS_ENABLED=false`. Use only if a Commerce/Customer Intelligence tool itself is misbehaving, independent of the AI layer.
4. **Roll back the percentage**, not just to zero but to the allow-list-only step, if the issue is traffic-scale-dependent (e.g., the Stage 11 finding: DB connection-pool contention under concurrent load) rather than a correctness bug.

None of these require a code rollback or a database migration reversal — they are all environment-variable flips, deliberately, so rollback is never blocked on a deploy pipeline being available.

---

## 5. What to monitor immediately after each ladder step

`/admin/analytics/ai-gateway` (Stage 9) — success rate, fallback rate, p95
latency, provider/tool error counts, rate-limit events, token totals, most-
used tools, health checks. No customer prompt content ever appears there.

Alert thresholds to configure in whatever external alerting this hosting
platform uses (not built into this codebase — see `AI_PRODUCTION_AUDIT.md`'s
technical debt list):
- Fallback rate > 10% sustained for 15 minutes → investigate before
  expanding the rollout percentage further.
- p95 latency > 5s sustained → check the connection-pool finding in
  `AI_PRODUCTION_AUDIT.md` before assuming it's a code regression.
- Any `CRITICAL`-severity event in `GatewayObservabilityEvent` → page
  whoever owns this on-call.
