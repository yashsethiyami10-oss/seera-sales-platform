# Care Quotient Engine (CQ)

`lib/intelligence/cq-engine.ts` — `evaluateCare(priority, eq, context)`.

## "MUV's differentiator"

The module prompt names this engine as MUV's differentiator explicitly. It does not generate a customer
response — it evaluates 10 structured care recommendations from three prior-stage inputs (Priority, EQ,
Context), each derived by a fixed, documented rule, never a free-text judgment.

## Inputs read

- **`isHighUrgencyPriority`** — `priority.category` in `{SAFETY, CUSTOMER_RISK, COMPLAINT}` OR
  `priority.level` in `{URGENT, HIGH}`.
- **`isNegativeEmotion`** — `eq.state` in `{ANGRY, FRUSTRATED, CONCERNED, NEGATIVE}`.
- **`isConfused`** — `eq.state` in `{CONFUSED, CURIOUS}`.
- **`hasEscalatingCareWorkflow`** — any retrieved result in `context.retrievedKnowledge` has
  `internalMetadata.escalationRequired === true`.

## The 10 outputs and their rules

| Field | Rule |
|---|---|
| `requiredCareLevel` | `boolLevel(isHighUrgencyPriority, isNegativeEmotion)` — both → URGENT, either → HIGH, neither → MEDIUM |
| `reassuranceNeeded` | `isNegativeEmotion \|\| priority.category ∈ {SAFETY, CUSTOMER_RISK}` |
| `transparencyNeeded` | `isConfused \|\| isNegativeEmotion \|\| priority.category === COMPLAINT` |
| `escalationNeed` | `priority.category === SAFETY \|\| hasEscalatingCareWorkflow \|\| (isHighUrgencyPriority && isNegativeEmotion)` |
| `empathyLevel` | negative emotion → URGENT (if priority URGENT) or HIGH; confused → MEDIUM; else LOW |
| `followUpImportance` | escalation or COMPLAINT → HIGH; else MEDIUM |
| `educationNeed` | `isConfused \|\| priority.category === PRODUCT_ISSUE` |
| `supportPriority` | `priority.level` directly |
| `trustRisk` | SAFETY → URGENT; COMPLAINT or negative emotion → HIGH; else LOW |
| `customerEffort` | no retrieved knowledge → HIGH; confused → MEDIUM; else LOW |

Note that `requiredCareLevel` never reaches `URGENT` from `boolLevel` alone unless *both*
`isHighUrgencyPriority` and `isNegativeEmotion` are true — a safety-category priority with a neutral
customer tone yields `HIGH`, not `URGENT`, at this field specifically (though `escalationNeed` is still
forced `true` for any `SAFETY` category regardless of emotional tone, since that check is independent).

## Escalation is the one field with an unconditional trigger

`escalationNeed` is `true` whenever `priority.category === "SAFETY"`, regardless of what EQ or Context
say — this is the one place in the engine where a single upstream signal alone is sufficient, matching
Priority Engine's own "safety always wins" design.

## Output

`{ requiredCareLevel, reassuranceNeeded, transparencyNeeded, escalationNeed, empathyLevel,
followUpImportance, educationNeed, supportPriority, trustRisk, customerEffort, reasoning, evidence }` —
structured recommendations only. `reasoning` is one composed sentence referencing the driving
priority/EQ signals; `evidence` lists the concrete upstream facts that fired (e.g. `"priority: SAFETY
(URGENT)"`, `"emotional signal: ANGRY"`).
