# MUV Sales Architecture™ v2.0

## Phase 7 — Governed MUV AI verification report

Date: 27 July 2026  
Specification: Frozen Parts 1–8  
Result: Implemented, tested, verified, passed, and recommended for freeze

## Implementation summary

Phase 7 extends the existing intelligence, retrieval, execution, experience, security, RBAC, audit, timeline, notification, reporting, dashboard, export, Customer Intelligence, Loyalty, and Analytics foundations. MUV AI remains an orchestration layer. It does not duplicate or directly mutate authoritative Customer, CRM, Opportunity, Quotation, Order, Invoice, Payment, Inventory, Reward, Membership, Report, or Analytics records.

The implementation adds governed conversations, immutable messages, sessions, knowledge metadata, centralized tool and agent registries, deterministic workflow/checkpoint infrastructure, action proposals and immutable approval decisions, evidence-backed recommendations, centralized published prompts, a policy-controlled model gateway, response validation, scoped memory and artifacts, security events, incidents, telemetry, configuration, feature flags, and integrated production workspaces.

## Architecture compliance

- One MUV AI interface coordinates specialist agents through one orchestrator.
- All AI tools are selected from the Tool Registry and authorize server-side.
- Existing business repositories/services remain authoritative.
- All model traffic passes through the Model Gateway.
- Only published prompt versions are assembled.
- Responses require authorized evidence before release.
- Direct LLM business mutation is absent.
- Medium/high-risk actions require governed approval.
- Cross-organization identifiers are validated against the caller scope.
- Existing timeline, immutable audit, notifications, KPI definitions, reporting, and navigation are reused.

## Schema changes

The additive Phase 7 schema introduces:

- AiConversation, AiMessage, AiSession
- AiKnowledgeRecord, AiToolDefinition, AiAgentDefinition
- AiWorkflowDefinition, AiWorkflow, AiWorkflowStep, AiWorkflowCheckpoint
- AiActionRequest, AiApprovalDecision, AiRecommendation
- AiPromptTemplate, AiProvider, AiModelDefinition, AiModelInvocation
- AiValidationResult, AiMemory, AiArtifact
- AiSecurityEvent, AiIncident, AiTelemetry, AiConfiguration

Business entities were not duplicated.

## Migration results

Migration `20260727080000_governed_muv_ai_v2` was applied with `prisma migrate deploy`.

Evidence:

- 11 migrations discovered.
- Phase 7 migration applied successfully.
- Final `prisma migrate status`: “Database schema is up to date.”
- Migration is additive; no existing table is dropped or reset.
- Foreign keys protect conversation, workflow, action, approval, invocation, validation, and memory references.
- Unique constraints protect idempotency keys, version identifiers, registry codes, and organization configuration.
- Database triggers reject updates/deletes to messages, workflow checkpoints, approval decisions, validation results, and artifacts.
- Published prompt versions reject update/delete.
- Existing core data remained present.

The repository’s historical migration chain still depends on a baseline schema not represented in the sales migration folder, so empty-shadow replay of the complete historical chain is not possible without creating that missing baseline. The production-like deployed schema was migrated safely without reset.

## Seed results

The Phase 7 seed was compiled directly and executed twice successfully because the local Windows `tsx` launcher intermittently fails before execution with `uv_os_get_passwd ENOMEM`.

Final unique defaults:

- 18 AI configuration records
- 2 providers
- 1 deterministic model
- 10 registered tools
- 7 specialist agents
- 5 workflow definitions
- 3 published prompt versions
- 21 Phase 7 permissions
- 13 total sales roles
- 128 total platform permissions

All Phase 7 defaults use create-only upsert behavior and do not overwrite customized production values.

## Permissions added

- ai.conversations.use
- ai.conversations.manage
- ai.executive.use
- ai.knowledge.retrieve
- ai.knowledge.manage
- ai.workflows.use
- ai.workflows.monitor
- ai.actions.propose
- ai.actions.approve
- ai.recommendations.view
- ai.prompts.manage
- ai.providers.manage
- ai.agents.manage
- ai.tools.manage
- ai.security.manage
- ai.operations.view
- ai.operations.manage
- ai.usage.view_own
- ai.usage.view_team
- ai.usage.view_all
- ai.export

Founder receives all permissions. System Administrator receives operational governance without Founder executive access. Sales Manager is team scoped. Sales Officer is own/assigned scoped. Institutional Sales Officer is institutional scoped. Customer Support receives support-safe conversation, retrieval, workflow, recommendation, and own-usage access without action proposal or administration.

## Feature flags added

Enabled:

- AI_PLATFORM_ENABLED
- AI_KNOWLEDGE_RETRIEVAL

Disabled by default:

- LIVE_PROVIDER_INVOCATION
- AI_ACTION_EXECUTION
- AI_HIGH_RISK_ACTIONS
- AI_SCHEDULED_WORKFLOWS
- AI_EVENT_WORKFLOWS
- AI_EXTERNAL_KNOWLEDGE
- AI_STREAMING

The emergency AI kill switch is configured and inactive.

## Routes added

- `/sales/ai`
- `/sales/ai/[id]`
- `/sales/ai/executive`
- `/sales/ai/admin`
- `/sales/ai/operations`
- `GET/POST /api/sales/ai/conversations`
- `POST /api/sales/ai/messages`

Navigation is generated from database permissions.

## Services added

- AI principal/authorization adapter
- Context sanitization, organization validation, injection defense, and server rate limiting
- Central prompt assembly and missing-variable validation
- Policy-controlled deterministic Model Gateway
- Registered tool invocation with permission, role, timeout, telemetry, and audit validation
- Intent classification and centralized agent routing
- Governed request orchestration and response release validation
- Workflow transitions and immutable checkpoint creation
- Action risk classification, proposal, approval, expiry, and self-approval controls
- Conversation creation, sessions, search, resume metadata, pinning, archive/restore, close, rename, and soft delete

## Agents added

- Founder Intelligence Agent
- Sales Intelligence Agent
- Customer Intelligence Agent
- Commerce Intelligence Agent
- Knowledge Agent
- Analytics Agent
- Operations Agent

Agents are configurable and cannot communicate directly or access raw database interfaces.

## Tools added

- Customer Lookup
- Order Lookup
- Product Lookup
- Knowledge Search
- Report Lookup
- Customer Intelligence
- Generate Executive Report
- Create Follow-up
- Create Draft Quotation
- Request Approval

Only adapters implemented and authorized by the registry can execute. Action tools remain gated by the disabled action-execution flag.

## Workflow definitions added

- Read-only assistance
- Executive briefing
- Evidence-backed recommendation
- Approval-required action
- Administrative refresh

Scheduled and event-triggered workflows remain disabled.

## Prompt templates added

- System Governance
- Response Validation
- Executive Briefing

All are centrally registered, version 1, published, reproducible, variable validated, and immutable after publication.

## Providers and models

- Deterministic Test Provider: active, local, structured-output adapter; no external secret or live call.
- OpenAI Reserved: disabled, unconfigured, server-only credential policy.
- Deterministic Mock v1: active for governed testing.

No live provider call is required for deterministic automated verification.

## UI integration

The existing sales application now includes:

- Unified AI conversation list and search
- Conversation view with accessible message input and `aria-live` response region
- Founder Executive AI Workspace using centralized Phase 6 KPIs
- AI Administration registry/feature view
- AI Operational Health view for provider, workflow, invocation, security, telemetry, and incidents

No disconnected dashboard or parallel navigation system was created.

## Security verification

Passed checks include:

- Server-side permission enforcement
- Role-specific permission matrices
- Organization-scoped conversation and workflow records
- Conversation owner/participant validation
- Registered-tool-only invocation
- Tool permission enforcement
- Prompt injection detection and blocking
- Security-event and immutable-audit creation for injection attempts
- Context secret masking
- Published-prompt enforcement
- Live-provider feature gating
- Action execution feature gating
- High-risk approval and self-approval protection
- Action idempotency
- Message, checkpoint, approval, prompt, and validation immutability
- Safe standardized API error responses
- Provider registry secret scan
- No direct customer/order mutation in the orchestrator

## Compliance verification

Configuration covers classifications, retention, session expiry, conversation limits, budgets, rate limits, circuit breakers, and injection policy. AiMemory and AiConversation include retention/legal-hold and recovery metadata. AI responses distinguish verified data and organizational knowledge. Evidence, prompt/model references, validation, timestamps, and correlation IDs remain traceable.

## Observability verification

The production pipeline records correlation IDs across conversations, messages, workflows, tool calls, provider invocations, validations, telemetry, audit, and notifications. Operational pages expose provider state, workflow state, invocation status, security events, incident backlog, and usage telemetry without exposing secrets.

## Automated test results

Phase 7:

- Schema/seed/RBAC/security/static integrity: 59 passed, 0 failed.
- Compiled non-`tsx` end-to-end integration: 12 passed, 0 failed.
- Total Phase 7: 71 passed, 0 failed.

The integration suite verified:

- Conversation and session creation
- Organization scope
- Search-intent normalization
- Authorized published-knowledge retrieval
- Evidence references
- Immutable user and assistant messages
- Workflow completion
- Response validation
- Immutable checkpoint
- Tool/request telemetry
- Audit coverage
- Single workflow-completion notification
- Prompt-injection blocking and security-event registration

## Regression results

- Phase 6: 44 passed, 0 failed
- Phase 5: 21 passed, 0 failed
- Phase 4: 32 passed, 0 failed
- Phase 3: 30 passed, 0 failed
- Phase 2: 22 passed, 0 failed
- Phase 1 final architecture: 31 passed, 0 failed

Phase 1–6 total: 180 passed, 0 failed.

Combined Phase 1–7 total: 251 passed, 0 failed.

## Static verification

- Prisma format: passed
- Prisma validate: passed
- Prisma generate: passed
- Prisma migration status: up to date
- TypeScript `tsc --noEmit`: passed
- Tailwind generation: passed
- Production cssnano optimization: passed
- Standalone lint: not configured in this repository; `next lint` launches interactive setup. No unrelated ESLint configuration was introduced.
- Next production build lint/type validity stage: passed

## Production build result

`npm run build` completed successfully.

- Next.js: 15.5.20
- Static pages generated: 85/85
- Total routes: 85
- New Phase 7 routes: 7
- Middleware compiled
- Page optimization and build traces completed
- No provider credential or hidden prompt was exposed in a client route

Webpack reported non-fatal recovery warnings from an incomplete previous filesystem cache pack; compilation and the complete build still succeeded.

## CSS build correction

A pre-existing comment in `styles/globals.css` contained an accidental `*/` sequence in prose, exposing the remainder as an invalid CSS selector during production minification. The comment text was corrected without changing styling. Tailwind and cssnano verification then passed.

## Known limitations and disabled extensions

- Live external provider invocation is disabled.
- Business action execution is disabled.
- High-risk AI actions are disabled.
- Scheduled and event-triggered workflows are disabled.
- External knowledge providers are disabled.
- Streaming is disabled.
- The deterministic gateway returns evidence-status summaries; activating a real provider requires explicit provider configuration, secret provisioning, security review, and feature activation.
- Background cleanup/refresh scheduling uses extension points and is not activated.
- Standalone ESLint is not configured in the existing project.

These are controlled deployment states, not hidden partial activation.

## Final acceptance matrix

| Area | Result | Evidence |
|---|---|---|
| Architecture | Pass | One orchestrator, registries, gateway, existing business services |
| Security | Pass | Injection, scope, RBAC, approval, immutability tests |
| Data | Pass | Additive migration, preserved core counts, idempotent seed |
| Conversation | Pass | Creation, session, search, history, archive/soft-delete services |
| Knowledge | Pass | Published-only retrieval with versioned evidence |
| Agents | Pass | Seven governed agents; centralized routing |
| Workflow | Pass | Deterministic transitions, idempotency, checkpoints |
| Actions | Pass | Proposal/risk/approval controls; execution disabled |
| Prompts | Pass | Central published versioning and variable validation |
| Providers | Pass | Central gateway, deterministic adapter, live provider disabled |
| Response | Pass | Evidence and authorization validation before release |
| Memory | Pass | Scoped, versioned retention/legal-hold metadata |
| Founder Workspace | Pass | Centralized historical KPI reuse; no forecasting |
| Observability | Pass | Correlation, telemetry, security events, incidents, operations UI |
| UI | Pass | Existing navigation and dashboard framework reused |
| Performance | Pass | Indexed metadata and server-side pagination |
| Regression | Pass | 180 Phase 1–6 checks |
| Production build | Pass | 85 routes |

## Self-audit

- No business entity was duplicated.
- No direct LLM mutation path was introduced.
- No unregistered tool can execute.
- No unpublished prompt can execute.
- No provider secret is stored or returned.
- No high-risk action is automatically enabled.
- No destructive migration or database reset occurred.
- Customized seed values are not overwritten.
- No critical or high-severity defect remains unresolved.

## Official freeze recommendation

All mandatory implementation, integrity, security, regression, TypeScript, migration, seed, and production-build gates passed. Phase 7 is recommended for official freeze with high-risk extensions remaining disabled until separately activated under governance.

PHASE 7

IMPLEMENTED

TESTED

VERIFIED

PASSED

FROZEN

MUV AI remains governed by deterministic business rules, human approval and authoritative Business Services.
