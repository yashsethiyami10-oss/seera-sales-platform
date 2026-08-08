# Priority Engine

`lib/intelligence/priority-engine.ts` — `evaluatePriority(retrievedKnowledge, request)`.

## Categories (fixed, 9 values)

`SAFETY`, `CUSTOMER_RISK`, `BUSINESS_CRITICAL`, `CUSTOMER_GOAL`, `URGENCY`, `PRODUCT_ISSUE`,
`COMPLAINT`, `SALES_OPPORTUNITY`, `GENERAL_INQUIRY` — exactly the 9 named in the module prompt, no more,
no fewer.

## Evaluation order (fixed, first match wins)

```
1. SAFETY            — safety keyword in message OR retrieved knowledge flags HIGH/CRITICAL risk or escalation
2. CUSTOMER_RISK      — retrieved knowledge flags risk/escalation (no explicit safety keyword)
3. BUSINESS_CRITICAL  — businessContext/institutionalContext supplied, or an institutional-support-tagged workflow was retrieved
4. COMPLAINT          — complaint keyword in message, or a complaint/refund/replacement-tagged workflow was retrieved
5. PRODUCT_ISSUE      — retrieved knowledge includes Product or Problem Intelligence
6. URGENCY            — urgency keyword in message
7. SALES_OPPORTUNITY  — sales keyword in message, or a sales/quotation-tagged workflow was retrieved
8. CUSTOMER_GOAL      — customerGoal was supplied, no higher-priority signal fired
9. GENERAL_INQUIRY    — nothing else matched
```

This order is the actual mechanism that guarantees "safety always outranks a sales opportunity" — it is
not a learned weighting, it is a fixed if/else cascade evaluated top to bottom, and the function returns
on the first branch that matches.

## Score table (fixed)

| Category | Score | Level band |
|---|---|---|
| SAFETY | 100 | URGENT (≥85) |
| CUSTOMER_RISK | 90 | URGENT |
| BUSINESS_CRITICAL | 75 | HIGH (≥60) |
| PRODUCT_ISSUE | 65 | HIGH |
| COMPLAINT | 60 | HIGH |
| URGENCY | 55 | MEDIUM (≥30) |
| SALES_OPPORTUNITY | 45 | MEDIUM |
| CUSTOMER_GOAL | 30 | MEDIUM |
| GENERAL_INQUIRY | 10 | LOW (<30) |

`levelForScore()` maps the fixed score to one of the 4 `IntelligenceLevel` values via fixed thresholds
(≥85 URGENT, ≥60 HIGH, ≥30 MEDIUM, else LOW) — the score and the level are two views of the same fixed
table, not independently tunable.

## Signal sources

- **Message keywords** — four fixed lexicons (`SAFETY_KEYWORDS`, `COMPLAINT_KEYWORDS`,
  `URGENCY_KEYWORDS`, `SALES_KEYWORDS`), matched as case-insensitive substrings against
  `request.customerMessage`.
- **Retrieved-knowledge signals** — `internalMetadata.riskLevel`/`internalMetadata.escalationRequired`
  (from Module 5's retrieval, only populated for staff-or-higher clearance — see
  [architecture.md](./architecture.md)), and `internalMetadata.category` matched against three fixed
  hint lists (`BUSINESS_CATEGORY_HINTS`, `SALES_CATEGORY_HINTS`, `COMPLAINT_CATEGORY_HINTS`).
- **Source type presence** — whether any retrieved result is `PRODUCT_INTELLIGENCE` or
  `PROBLEM_INTELLIGENCE` (drives `PRODUCT_ISSUE`).
- **Supplied context** — `businessContext`/`institutionalContext`/`customerGoal` object presence.

## What Priority Engine does NOT read

`conversationContext`, `websiteContext`, and `memory` are never consumed here — priority is meant to be
a fast, early classification off the message and retrieved knowledge alone; later stages (Context,
Memory, CQ, Decision) layer in the rest.

## Output shape

```ts
{ category: PriorityCategory; level: IntelligenceLevel; score: number; evidence: string[]; reasoning: string; }
```

`evidence` always lists the concrete matched keyword(s) or signal(s) that produced the category — never
empty, even for `GENERAL_INQUIRY` (`"no specific signal detected"`). This satisfies the module prompt's
explainability requirement at the individual-engine level, before Explainability Metadata (stage 8)
aggregates it.

## What Priority Engine explicitly does not do

"The engine only assigns priority. It never decides responses." No field in `PriorityResult` is
customer-facing text, and no branch here calls into Decision, CQ, or any generation logic.
