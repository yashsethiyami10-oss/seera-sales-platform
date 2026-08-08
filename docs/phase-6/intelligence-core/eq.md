# Emotional Intelligence Engine (EQ)

`lib/intelligence/eq-engine.ts` — `evaluateEmotion(customerMessage)`.

## States (fixed, 11 values)

`NEUTRAL`, `CONFUSED`, `FRUSTRATED`, `ANGRY`, `CONCERNED`, `CURIOUS`, `INTERESTED`, `SATISFIED`,
`POSITIVE`, `NEGATIVE`, `UNKNOWN` — exactly the 11 named in the module prompt.

## What this engine is guarding against

The module prompt's constraints for this engine are unusually strict, and the code follows them
literally:

- **"Never claim certainty."** Every result has a `confidence` (0–100) and `confidenceLevel`
  (`LOW`/`MODERATE`/`HIGH`); the maximum achievable confidence is capped at 90, never 100 — the code
  structurally cannot claim certainty.
- **"Unknown must always remain valid."** No message text → `UNKNOWN` (confidence 0). This is the first
  branch checked, not a fallback bolted on afterward.
- **"No psychological profiling. No medical inference. No identity inference."** The `reasoning` string
  on every non-`UNKNOWN`/`NEUTRAL` result explicitly states "a lexicon match, not a psychological or
  medical assessment." Matching is against literal word choice only — no message length, writing style,
  or any other proxy signal is used.
- **"EQ is guidance only."** Nothing in this file, or anywhere downstream, treats an EQ result as a fact
  about the customer — CQ and Decision consume it as one input among several.

## How classification works

1. No message or empty/whitespace-only message → `UNKNOWN`, confidence 0.
2. A fixed `LEXICON` (9 entries, each an `EmotionalState` + a fixed term list) is checked against the
   lowercased message via substring match. `ANGRY`, `FRUSTRATED`, `CONCERNED`, `CONFUSED`, `CURIOUS`,
   `SATISFIED`, `INTERESTED`, `POSITIVE`, `NEGATIVE` each have their own term list.
3. Zero matches → `NEUTRAL`, confidence 20 (`LOW`) — a deliberately low-confidence default, not treated
   as a confident "customer is neutral" claim.
4. One or more matches → the state with the most matching terms wins; ties are broken by lexicon
   position (earlier entries in the array win ties — `ANGRY`/`FRUSTRATED` are listed first, so urgent
   states win ties over milder ones like `CURIOUS`).
5. Repeated exclamation marks (≥2) intensify `ANGRY`/`FRUSTRATED` specifically, adding to both the
   confidence score and the evidence list.

## Confidence formula

`min(90, 40 + matchCount*20 + (intensified ? 10 : 0))`, thresholded into `HIGH` (≥70), `MODERATE`
(≥45), `LOW` (below). A single keyword match yields 60 (`MODERATE`); two matches or one intensified
match reach `HIGH`.

## Evidence

Every non-default result lists the literal matched term(s) (`"furious"`, `"unacceptable"`) and, when
applicable, the exclamation-mark count — so a founder can always see exactly which words drove the
classification.
