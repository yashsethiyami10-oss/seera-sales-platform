# Stage 6E — LLM Integration Report

**Headline, stated once so it cannot be missed: no live call to Anthropic or OpenAI was made anywhere in
this stage.** No `ANTHROPIC_API_KEY` or `OPENAI_API_KEY` exists in this development environment (confirmed
before writing any code). Everything below that says "real" means real, callable, production-shaped code
— not a verified live network round-trip. Everywhere this report says "not verified against a live API,"
that is the literal, complete truth, not a hedge.

## Requirement-by-requirement status

| Requirement | Status | Evidence |
|---|---|---|
| Provider abstraction | ✅ Real | `LLMProvider` interface (`lib/runtime/types.ts`), unchanged contract shape from Stage 6C, now with 2 real implementations behind it |
| OpenAI compatibility | ✅ Real code; ⚠️ unverified live | `lib/ai/providers/openai.ts` — real Chat Completions API request/response shape, per OpenAI's public docs. No live call made. |
| Anthropic compatibility | ✅ Real code; ⚠️ unverified live | `lib/ai/providers/anthropic.ts` — real Messages API request/response shape, per Anthropic's public docs. No live call made. |
| Future provider support | ✅ Real | Adding a provider is one new class + one `switch` case in `lib/ai/index.ts`'s `getLLMProvider()` — the exact same pattern `lib/shipping/index.ts`/`lib/messaging/index.ts` already established and this codebase already trusts |
| Conversation memory compatibility | ✅ Real | `LLMGenerationInput.conversationHistory` (new field) threaded from `RuntimeTurnInput.conversationHistory` through the orchestrator into every provider's message construction |
| Streaming support | ⚠️ Partial | `LLMProvider.generateStream?` exists in the contract as an optional method; **not implemented in either concrete provider this stage** and **not consumed anywhere** — the current transport (`actions/runtime.ts`'s Server Action) does not stream tokens to a caller. See §"Streaming — honest scope" below. |
| Retry strategy | ✅ Real | Both providers wrap their real `fetch()` call in `lib/retry.ts`'s existing `retryWithBackoff()` — reused, not reimplemented; exponential backoff with jitter, retries only on 5xx/429 |
| Timeout handling | ✅ Real | `AbortController` + 20s timeout in both providers, real and testable (the abort fires and the promise rejects) even without a live endpoint to time out against |
| Fallback behaviour | ✅ Real, tested | `response-assembly-runtime.ts` catches any provider failure and falls through to the deterministic Repository-First composer — verified with a forced-failure mock provider (`MOCK_LLM_FORCE_ERROR=true`), confirming `fallbackUsed: true` and no raw error surfaced |
| Prompt versioning | ✅ Real | `lib/ai/prompt.ts`'s `PROMPT_VERSION` constant, threaded through `LLMGenerationInput.promptVersion` → `ResponseAssemblyResult.promptVersion` → `RuntimeAuditLog.stageTrace` |
| Audit logging | ✅ Real | `RuntimeAuditLog.stageTrace` (existing JSON column, no migration needed) now includes `{ provider, fallbackUsed, promptVersion, usage }` for every turn |
| Repository citations | ✅ Real, tested | `citationsIncluded` populated from the same real retrieved results the model was given; verified a fabricated/uncited KOID in provider output is caught (see Safety section) |
| Confidence propagation | ✅ Real | `LLMGenerationInput.confidenceLevel` passed into the prompt itself (`buildSystemInstructions()` includes explicit hedging instructions per confidence level), not only checked after the fact |
| Safety Runtime integration | ✅ Real, tested | `safety-runtime.ts`'s `CITATION_COMPLETENESS` check strengthened specifically for real-provider output — proven to fail a response citing a KOID it was never given, and proven NOT to falsely penalize the deterministic fallback path for the same text pattern |
| PII Runtime integration | ✅ Real, unchanged | `privacy-engine.ts` runs before any provider call, exactly as in Stage 6C — `redactedText`, never raw text, is what reaches `LLMGenerationInput.redactedUserMessage` |
| Grounding enforcement | ✅ Real, two independent layers | (1) prompt-level: `buildSystemInstructions()` explicitly instructs "never state a fact... not present in the grounded context"; (2) post-generation: the citation-completeness check above. "The LLM must never become the authoritative knowledge source" is enforced structurally at both ends of the call, not just documented. |

**14 of 16 requirements: real, working code.** The 2 marked otherwise (OpenAI/Anthropic "unverified live",
Streaming "partial") are named explicitly, not folded into a vague "mostly done."

## Streaming — honest scope

The Founder's protocol lists "Streaming support" as a requirement. What exists: the `LLMProvider`
contract has an optional `generateStream` method, so a provider CAN implement token-by-token output
without changing the interface again later. What does NOT exist: neither `AnthropicProvider` nor
`OpenAIProvider` implements it this stage, and `actions/runtime.ts`'s Server Action transport has no
mechanism to stream a Server Action's return value to a client incrementally — that would require a Route
Handler with a `ReadableStream` response (or a different transport entirely), which is a change to
`actions/runtime.ts`/the calling surface, not to `lib/runtime/*` or `lib/ai/*`. Building that was judged
out of this stage's scope ("do NOT create new engineering layers... do NOT redesign runtime") since it
touches the transport layer, not the runtime engine. Flagged here as a real, named gap for Founder
awareness, not silently declared "done."

## What WAS verified, precisely

- `AnthropicProvider`/`OpenAIProvider` throw a specific, correct "API key not set" error when no key is
  configured — real, deterministic, verified.
- The `getLLMProvider()` factory correctly returns `null` when `LLM_PROVIDER` is unset (deterministic
  fallback remains the entire behavior), correctly selects `MockLLMProvider` for `LLM_PROVIDER=MOCK`, and
  correctly throws for an unrecognized value — all 3 real, verified.
- A full round-trip through `assembleResponse()` using `MockLLMProvider` — grounded-context construction
  from real retrieved Knowledge Objects, `usedProvider`/`usage`/`promptVersion` correctly populated,
  response text genuinely built only from the real grounded context (never invented).
- Forced provider failure correctly falls back, never surfaces a raw error, never reports a provider name
  on the fallback path.
- A fabricated-citation safety check correctly fails real-provider-shaped output and correctly does NOT
  penalize the same text pattern on the deterministic fallback path (which is structurally incapable of
  fabricating a citation).

## What was NOT verified, precisely

- Any real network call to `api.anthropic.com` or `api.openai.com`.
- Real streaming token output.
- Retry behavior against an actual flaky/rate-limited endpoint (the retry logic itself is reused,
  already-trusted code from `lib/retry.ts`, not new logic this stage wrote and left untested — but its
  application inside these 2 new providers specifically was not exercised against a real 429/5xx).
- Real generative Hindi/Hinglish output (depends on a real provider — see
  `MULTILINGUAL_VALIDATION_REPORT.md`).
- Real conversation-memory quality over many turns (the plumbing that passes history through is verified;
  whether a real model uses it well is a provider-quality question, not an engineering one).

## Recommended before any live use

1. A Founder decision on which provider (Anthropic vs. OpenAI vs. both) and a real API key configured in
   a real deployment environment, not this one.
2. A manual smoke test against the live API once a key exists — one real call, checked by a human, before
   trusting this in front of a customer.
3. A decision on whether streaming is worth the transport-layer work this stage deliberately did not do.
