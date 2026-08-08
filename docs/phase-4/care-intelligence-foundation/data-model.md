# Data Model

All models live in `prisma/schema.prisma`, appended after Module 3's `ProblemEvidenceSource` model.
Every table is additive — no existing table, column, or relation was altered.

## Enums

| Enum | Values | Reused from |
|---|---|---|
| `KnowledgeLayer` | `PUBLIC`, `INTERNAL`, `CONFIDENTIAL` | Module 1 (not redefined) |
| `ProblemConfidenceLevel` | `LOW`, `MODERATE`, `HIGH` | Module 3 (not redefined) — used for `CareEvidenceSource.confidence` |
| `CareIntelligenceStatus` | `DRAFT`, `REVIEW`, `PUBLISHED`, `ARCHIVED` | New |
| `CarePriority` | `LOW`, `MEDIUM`, `HIGH`, `URGENT` | New |
| `CareResolutionCondition` | `RESOLVED`, `PENDING`, `WAITING_CUSTOMER`, `WAITING_TEAM`, `ESCALATED`, `CLOSED`, `CANCELLED` | New |

## Core models

### `CareIntelligence`
The stable item — `id`, `slug` (unique), `layer`, `createdAt`/`updatedAt`, `versions[]`.

### `CareIntelligenceVersion`
One evolving unit of work.

| Section | Fields |
|---|---|
| Identity | `title`, `category` (free text), `summary` |
| Customer Situation | `situationDescription`, `situationTags String[]` |
| Care Objective | `careObjectives String[]` |
| Human Escalation (snapshot) | `escalationRequired`, `escalationReason`, `escalationTeam`, `escalationPriority` (`CarePriority?`), `escalationSla`, `escalationInternalNotes` |
| Communication Guidance | `communicationTone`, `thingsToAvoid String[]`, `mandatoryStatements String[]`, `optionalGuidance String[]`, `transparencyRules String[]` |
| Resolution Conditions | `applicableResolutionConditions CareResolutionCondition[]` |
| Follow-up Guidance | `followUpGuidance`, `maxWaitingPeriod`, `reminderInterval`, `closureConditions` |
| Institutional Sales Support | `applicableCustomerSegments String[]` (free text — Hotels/Hospitals/Schools/etc. are examples, not a closed list) |
| Relationships | `relatedProducts Product[]`, `relatedProductIntelligence ProductIntelligence[]`, `relatedProblemIntelligence ProblemIntelligence[]`, `relatedKnowledgeItems KnowledgeItem[]` (all implicit m2m) |
| Version metadata | `versionNumber`, `status`, `changeNote`, `authorId`→`User`, `reviewedById`/`reviewedAt`→`User`, `publishedById`/`publishedAt`→`User`, `submittedForReviewAt`, `archivedAt`, timestamps |
| Structured children | `requiredInformation[]`, `careActions[]`, `evidenceSources[]` |

## Structured child tables (all `versionId` → `CareIntelligenceVersion`, cascade delete)

| Model | Fields |
|---|---|
| `CareRequiredInformation` | `label`, `description`, `isRequired`, `displayOrder` |
| `CareAction` | `stepNumber`, `description`, `actor`, `preconditions`, `expectedOutcome`, `failureHandling` |
| `CareEvidenceSource` | `source`, `approved`, `confidence` (`ProblemConfidenceLevel`), `reviewerId`→`User`, `reviewDate`, `internalNotes` |

## Indexes

- `CareIntelligence`: `@@index([layer])`
- `CareIntelligenceVersion`: `@@unique([careIntelligenceId, versionNumber])`, `@@index([careIntelligenceId, status])`
- Every child table: `@@index([versionId])`

## Constraints and data-loss risk

Applied via `prisma db push` — confirmed "database now in sync," zero existing tables altered, zero data
loss. No migration file was generated (project convention, unchanged from Modules 1–3).
