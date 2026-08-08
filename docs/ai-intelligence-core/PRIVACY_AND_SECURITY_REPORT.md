# Stage 6C — Privacy and Security Report

**Scope:** the Privacy Engine (`lib/runtime/privacy-engine.ts`, FD-AIC-004's pre-generation half),
the Safety Runtime's `PII_LEAKAGE`/`INTERNAL_INFO_LEAKAGE` checks (post-generation half), and the
authorization boundary on every new Server Action.

## 1. Pre-generation PII boundary (FD-AIC-004)

### Detected categories and how

| Category | Method | Blocks the LLM call, or redacts-and-proceeds? |
|---|---|---|
| `PHONE` | Regex, Indian mobile format (`+91` optional, `[6-9]\d{9}`) | Redacts, proceeds |
| `EMAIL` | Standard email regex | Redacts, proceeds |
| `PAYMENT_INFO` | Grouped 13–19 digit sequence (card-number shaped) | **Blocks** |
| `CREDENTIAL` | `password`/`api key`/`secret`/`otp`/`auth token` followed by `:`/`=` and a value | **Blocks** |
| `POSTAL_ADDRESS` | 6-digit sequence (Indian PIN code heuristic) | Redacts, proceeds |
| `INTERNAL_CUSTOMER_ID` | Prisma-cuid-shaped string (`c` + 24 lowercase alphanumerics) | Redacts, proceeds |
| `CONFIDENTIAL_BUSINESS_DATA` | Fixed keyword list (`internal only`, `confidential:`, `margin is`, `cost price is`, etc.) | Redacts, proceeds |

Confirmed by script (8 checks, all passed): phone/email detected and absent from redacted text;
`safeToProceed` correctly `true` for phone/email-only input; `restorePlaceholders()` round-trips a
redacted string back to the exact original; `PAYMENT_INFO` and `CREDENTIAL` both correctly set
`safeToProceed: false` with a non-null `blockReason`; empty input is trivially safe.

**When `safeToProceed` is `false`, the orchestrator never calls an LLM provider** —
`response-assembly-runtime.ts`'s `assembleResponse()` checks `privacy.safeToProceed` as its very first
statement and returns a safe, language-templated fallback message before any provider call is attempted.
Confirmed by script: a card-number input produces a response with `groundedInRepository: false`,
`citationsIncluded: []`, and a `fallbackReason` exactly matching the Privacy Engine's `blockReason`.

### Honest limitations — false negatives are possible

- `POSTAL_ADDRESS` detection is a bare 6-digit-number heuristic. It will miss any address without an
  explicit PIN code, and will false-positive on any unrelated 6-digit number (an order quantity, a
  product code, etc.) — acceptable for this stage's "detect and redact defensively" goal, but not a
  precision address parser.
- `INTERNAL_CUSTOMER_ID` matches the *shape* of a Prisma cuid, not its actual referent — it cannot tell
  whether a matched string is a customer ID, an order ID, a product ID, or any other cuid-shaped value in
  this codebase. It over-redacts by design (safer to over-redact than under-redact) rather than under-
  detecting.
- `CONFIDENTIAL_BUSINESS_DATA` only catches the fixed keyword list above — arbitrary sensitive business
  language (e.g. an unlisted synonym for "internal only") will not be caught.
- No PII detection here is a trained model — this is entirely pattern/regex-based. It should not be
  represented as comprehensive PII coverage in any Founder-facing summary.

## 2. Post-generation leakage checks (Safety Runtime)

`PII_LEAKAGE` and `INTERNAL_INFO_LEAKAGE` are 2 of the Safety Runtime's 12 always-evaluated post
-generation checks (`lib/runtime/safety-runtime.ts`).

- **`PII_LEAKAGE`** — confirmed by script: a response text containing a raw (pre-redaction) PII value
  correctly fails this check, with `blockedReasons` starting `"PII_LEAKAGE:"`.
- **`INTERNAL_INFO_LEAKAGE`** — checks for the literal markers `internalmetadata`, `system prompt`,
  `system instructions` in lowercased response text. **Not independently tested this pass** (no test
  crafted a response containing one of these markers to confirm the check actually fires) — code exists,
  behavior not confirmed by execution. Flagged as a gap in `COMPLETE_ENGINEERING_TEST_REPORT.md`.

Both checks operate on the ASSEMBLED RESPONSE TEXT only. Since no real LLM provider is wired (see
`RUNTIME_IMPLEMENTATION_REPORT.md` §2.1), the only response text these checks can currently see is the
deterministic template composer's own output — which never includes raw PII or internal markers by
construction. **These checks have not yet been proven against real, unpredictable LLM-generated text**,
which is the actual threat model they exist for. This must be re-verified once a real provider is wired,
before any go-live decision.

## 3. Authorization boundary

Every one of the 5 new Server Actions in `actions/runtime.ts` calls `await requireStaff()` as its first
statement, confirmed by direct code inspection (not by executing an unauthorized call — see below):

| Action | Gate |
|---|---|
| `runRuntimeTurn` | `requireStaff()` + `RUNTIME_PIPELINE_ENABLED` flag |
| `getRuntimeAuditTrail` | `requireStaff()` |
| `getRuntimeFeatureFlags` | `requireStaff()` |
| `getFounderDecisionRegistrySnapshot` | `requireStaff()` |
| `getLearningCandidateQueue` | `requireStaff()` |

This follows CLAUDE.md's own documented rule: "every exported function in an `actions/*.ts` file is
independently callable as its own RPC endpoint... each exported action must call
`requireStaff()`/`requireAdmin()`/`requireCustomer()` itself." All 5 do.

**Not tested by execution:** an actual unauthorized call (anonymous or CUSTOMER-role session) against any
of these 5 actions was not made — `requireStaff()` calls `auth()`, which throws outside a real Next.js
request scope, so this could not be scripted (same structural blocker documented throughout this stage's
test reports). Code inspection confirms the gate is present and is the exact same `requireStaff()`
function every other module in this codebase already relies on and trusts.

## 4. Data-at-rest review

- `RuntimeAuditLog` — confirmed by schema review to contain no free-text message-content field (only
  `intentPrimary`, `retrievalMethodMix`, `conflictStatus`, `confidenceScore`, `safetyVerdict`,
  `stageTrace` — all structural, never customer message text).
- `LearningCandidate.evidence` (`Json`) carries a `summary` field that can include up to 200 characters of
  message text (`learning-runtime.ts`'s `UNANSWERED_QUESTION` signal specifically). **Found during this
  report's own review that the orchestrator was originally passing the raw `input.customerMessage` here —
  a genuine gap against FD-AIC-004's minimization requirement, since redaction had already run one stage
  earlier and was simply not reused.** Fixed in `runtime-orchestrator.ts`: the Learning Runtime stage now
  receives `privacy.redactedText` (the already-PII-redacted text from the PII Protection stage) instead of
  the raw message. Re-verified: `tsc --noEmit` clean, `scripts/verify-stage6c-runtime.ts` still 54/54
  passed after the fix (the script's own learning-signal fixtures use plain non-PII text, so behavior was
  unaffected; the fix matters for real PII-bearing input, which the script does not happen to exercise at
  that specific call site — a residual gap: no test directly confirms a PII-bearing message's summary
  comes out redacted end-to-end. Worth adding before go-live.).
- `placeholderMap` (the original-value ↔ placeholder mapping in `PrivacyScanResult`) is **never persisted
  anywhere** — confirmed by code inspection: `runtime-orchestrator.ts` only forwards the redacted-shape
  fields (`redactedText`, `matches`, `safeToProceed`, `blockReason`) into the final `RuntimeTurnResult`,
  explicitly typed as `Omit<PrivacyScanResult, "placeholderMap">`.

## 5. Summary verdict

**Not production-ready from a privacy standpoint as-is — acceptable for internal staff-only testing
only.** The structural boundary (block-before-LLM-call for payment/credential data, redact-before
-anything-else for other categories, never persist the placeholder map) is real and verified, and the one
concrete gap found during this review (`LearningCandidate.evidence.summary` receiving unredacted text) was
fixed and re-verified (54/54) before this report was finalized — not left as a documented-but-unfixed
item. What remains open: (a) no test directly confirms a PII-bearing message's Learning Runtime summary
comes out redacted end-to-end (the fix is verified by code review + unaffected regression, not by a
dedicated new test), (b) leakage checks are unproven against real LLM-generated text since no provider
exists yet, and (c) PII pattern coverage is deliberately narrow and should not be oversold as
comprehensive. None of this blocks internal, staff-only testing (which is all FD-AIC-003 currently
authorizes) — it does block any future customer-facing go-live decision until closed.
