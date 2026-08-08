# API Reference

All 8 actions live in `actions/experience.ts`, all `"use server"`, all validate input through the
matching schema in `lib/validations/experience.ts`, and all return either `{ success: true, data: {...}
}` or the standard `toErrorResponse(err)` shape.

## Customer-facing (ungated, rate-limited where noted)

### `startSession(input)`
Input: `{ channel?: string }` (defaults `"WEBSITE"`). Resolves `customerId` server-side from the real
auth session, if any (never from client input). Rate-limited: 20/min per IP. Output: `{ session:
ExperienceSessionRecord }`.

### `closeSession(input)`
Input: `{ sessionId: string }`. Output: `{ session: ExperienceSessionRecord }`.

### `orchestrateExperience(input)`
Input: `{ sessionId: string, customerMessage: string, customerGoal?: string }`. Runs the full Frozen
Flow. Rate-limited: 30/min per IP. Output: `{ view: WebsiteExperienceView }`.

### `adaptForWebsite(input)`
Input: `{ experienceResponse: ExperienceResponse }`. Output: `{ view: WebsiteExperienceView }`.

### `captureFeedback(input)`
Input: `{ sessionId: string, rating?: 1-5, comment?: string }` (at least one of the two required). Rate
-limited: 10/min per IP. Output: `{ feedback: FeedbackResult }`.

## Staff-facing (`requireStaff()`-gated)

### `prepareHandoff(input)`
Input: `{ sessionId: string, executionPackage: ExecutionPackage }`. Output: `{ handoff: HandoffPackage
}`.

### `prepareAnalyticsEvents(input)`
Input: `{ sessionId: string, executionPackage: ExecutionPackage }`. Output: `{ events: AnalyticsEvent[]
}`.

### `prepareReviewPackage(input)`
Input: `{ sessionId: string, executionPackage: ExecutionPackage, experienceResponse: ExperienceResponse
}`. Output: `{ review: ReviewPackage }`.

## Auth summary

| Action | Auth | Rate limit |
|---|---|---|
| `startSession` | none | 20/min/IP |
| `closeSession` | none | — |
| `orchestrateExperience` | none | 30/min/IP |
| `adaptForWebsite` | none | — |
| `captureFeedback` | none | 10/min/IP |
| `prepareHandoff` | `requireStaff()` | — |
| `prepareAnalyticsEvents` | `requireStaff()` | — |
| `prepareReviewPackage` | `requireStaff()` | — |

Every action independently performs its own auth/rate-limit check — none relies on being called from
within another already-checked action, per this codebase's standing rule that every exported Server
Action is independently callable as its own RPC endpoint (see `CLAUDE.md`).
