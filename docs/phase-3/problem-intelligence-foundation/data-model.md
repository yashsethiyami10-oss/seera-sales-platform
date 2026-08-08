# Data Model

All models live in `prisma/schema.prisma`, appended after Module 2's `ProductIntelligenceVersion` model.
Every table is additive — no existing table, column, or relation was altered.

## Enums

| Enum | Values | Reused from |
|---|---|---|
| `KnowledgeLayer` | `PUBLIC`, `INTERNAL`, `CONFIDENTIAL` | Module 1 (not redefined) |
| `ProblemIntelligenceStatus` | `DRAFT`, `REVIEW`, `PUBLISHED`, `ARCHIVED` | New |
| `ProblemRiskLevel` | `LOW`, `MODERATE`, `HIGH`, `CRITICAL` | New — shared by symptom/mistake/exclusion severity and safety risk level |
| `ProblemConfidenceLevel` | `LOW`, `MODERATE`, `HIGH` | New — deliberately has no "certain" value |
| `ProblemQuestionAnswerType` | `TEXT`, `BOOLEAN`, `SINGLE_SELECT`, `MULTI_SELECT`, `NUMBER`, `DATE`, `SCALE`, `IMAGE_REQUIRED` | New |
| `ProblemQuestionAudience` | `CUSTOMER_FACING`, `INTERNAL_ONLY` | New |
| `ProblemProductSuitability` | `PRIMARY`, `ALTERNATIVE`, `CONDITIONAL`, `SUPPORTING`, `NOT_RECOMMENDED` | New |

## Core models

### `ProblemIntelligence`
The stable, addressable item.

| Field | Type | Notes |
|---|---|---|
| `id` | `String` (cuid) | |
| `slug` | `String` | unique |
| `layer` | `KnowledgeLayer` | Public/Internal/Confidential |
| `createdAt`/`updatedAt` | `DateTime` | |
| `versions` | `ProblemIntelligenceVersion[]` | |

### `ProblemIntelligenceVersion`
One evolving unit of work — every structured child table below hangs off this, not off
`ProblemIntelligence` directly (see [architecture.md](./architecture.md)).

| Field | Type | Notes |
|---|---|---|
| `versionNumber` | `Int` | unique per `problemIntelligenceId` |
| `status` | `ProblemIntelligenceStatus` | default `DRAFT` |
| `publicTitle` | `String` | required |
| `internalTitle` | `String?` | |
| `summary` | `String? @db.Text` | |
| `problemCategory` | `String?` | free text — no fixed taxonomy was specified |
| `applicableCategories` | `Category[]` | implicit many-to-many with the real `Category` model |
| `tags` / `synonyms` / `searchTerms` | `String[]` | |
| `customerDescriptions` | `String[]` | flexible customer-phrasing examples |
| `riskLevel` | `ProblemRiskLevel` | default `LOW` |
| `escalationRequired` | `Boolean` | default `false` |
| `escalationReason` | `String? @db.Text` | |
| `emergencyWarningText` | `String? @db.Text` | |
| `humanReviewRequired` | `Boolean` | default `false` |
| `prohibitedRecommendation` | `Boolean` | default `false` |
| `requiredDisclaimers` | `String[]` | |
| `internalHandlingNotes` | `String? @db.Text` | |
| `changeNote` | `String? @db.Text` | |
| `authorId` → `User?` | | relation `ProblemVersionAuthor` |
| `reviewedById` → `User?`, `reviewedAt` | | relation `ProblemVersionReviewer` |
| `publishedById` → `User?`, `publishedAt` | | relation `ProblemVersionPublisher` |
| `submittedForReviewAt` / `archivedAt` | `DateTime?` | |

## Structured child tables (all `versionId` → `ProblemIntelligenceVersion`, cascade delete)

| Model | Key fields |
|---|---|
| `ProblemSymptom` | title, description, severity, isRequired, displayOrder, customerLanguageVariations, internalNotes |
| `ProblemCause` | title, explanation, likelihood, evidenceIndicators, internalNotes, displayOrder, **`confirmingQuestions`** (m2m → `ProblemDiagnosticQuestion`) |
| `ProblemDiagnosticQuestion` | questionText, purpose, answerType, isRequired, `validationRules`/`followUpConditions` (Json, variable shape by design), displayOrder, audience, **`options`** (1:many → `ProblemQuestionOption`) |
| `ProblemQuestionOption` | label, value, displayOrder — `questionId` → `ProblemDiagnosticQuestion` |
| `ProblemCommonMistake` | title, explanation, consequence, correction, severity, displayOrder |
| `ProblemProductRelationship` | `productId` → `Product` (required), `productIntelligenceId` → `ProductIntelligence` (optional), suitability, reason, conditionsRequired, usageNotes, priority, confidence, customerFacingExplanation, internalRationale, **`overrideJustification`** (set only when deliberately recommending a product an `ProblemExclusionRule` in the same version excludes) |
| `ProblemExclusionRule` | `productId?` → `Product`, `categoryId?` → `Category` (at least one required, enforced by Zod), reason, condition, severity, customerFacingWarning, internalNotes, escalationRequired |
| `ProblemUsageGuidance` | `productId?` → `Product`, `productIntelligenceId?` → `ProductIntelligence`, stepTitle, instructions, quantityOrDilution, frequency, duration, expectedTiming, safetyNote, displayOrder |
| `ProblemExpectedOutcome` | description, expectedTimeframe, conditions, limitations, confidenceLevel, customerFacingWording, internalEvidenceNotes, displayOrder |
| `ProblemPreventionGuidance` | title, guidance, frequency, applicableContext, displayOrder |
| `ProblemSafetyRule` | title, condition, riskLevel, escalationRequired, disclaimerText, internalNotes, displayOrder |
| `ProblemEvidenceSource` | sourceType, sourceReference, evidenceNotes, `reviewerId?` → `User`, reviewDate, confidenceClassification, **`internalOnly`** (default `true`) |

## Indexes

- `ProblemIntelligence`: `@@index([layer])`
- `ProblemIntelligenceVersion`: `@@unique([problemIntelligenceId, versionNumber])`, `@@index([problemIntelligenceId, status])`
- Every child table: `@@index([versionId])` (plus `productId`/`categoryId`/`questionId` indexes where those FKs exist)

## Constraints and data-loss risk

Applied via `prisma db push` — confirmed "database now in sync," zero existing tables altered, zero data
loss. No migration file was generated (this project uses `db push` for dev, consistent with every prior
module); a real `prisma migrate` should precede any production deploy pipeline. See
[testing.md](./testing.md) for the exact command and output.
