/**
 * MUV AI — Production Readiness & AI Governance (Module 9) shared types.
 *
 * This module introduces no new AI intelligence — every type here
 * describes the *operational state* of Modules 1–8, never a customer
 * -facing concept. Nothing here is imported from lib/intelligence or
 * lib/execution's own types (unlike Module 8) — Module 9 observes those
 * modules structurally (are they loaded, do they respond correctly to a
 * fixed smoke input), it does not consume their business output.
 */

// ---------------------------------------------------------------------------
// AI Health Monitor
// ---------------------------------------------------------------------------

export type SystemLayer = "KNOWLEDGE" | "RETRIEVAL" | "INTELLIGENCE" | "EXECUTION" | "EXPERIENCE";

export type LayerStatus = "HEALTHY" | "DEGRADED" | "UNAVAILABLE";

export type LayerHealth = {
  layer: SystemLayer;
  status: LayerStatus;
  detail: string;
  checkedAt: string;
};

export type SystemHealthReport = {
  overallStatus: LayerStatus;
  layers: LayerHealth[];
  generatedAt: string;
};

// ---------------------------------------------------------------------------
// Version Registry
// ---------------------------------------------------------------------------

export type VersionRegistry = {
  architectureVersion: string;
  aiVersion: string;
  schemaVersion: string;
  buildVersion: string;
  moduleVersions: Record<string, string>;
  deploymentTimestamp: string;
  deploymentTimestampSource: "env" | "process-start";
};

// ---------------------------------------------------------------------------
// Feature Flag Manager
// ---------------------------------------------------------------------------

export type FeatureFlagKey =
  | "EXPERIENCE_PLATFORM"
  | "FOUNDER_REVIEW"
  | "ANALYTICS"
  | "FEEDBACK"
  | "FUTURE_CHANNELS"
  // Stage 6C — Runtime Engineering. Master switch plus one flag per new
  // runtime module, all default false per FD-AIC-003 (Production
  // Protection) — "No new runtime module may become active for live users
  // until... Explicit Founder go-live authorization is issued." Flipping
  // any of these true does not, by itself, touch the live
  // orchestrateExperience() path (lib/experience/experience-orchestrator.ts)
  // — only actions/runtime.ts's staff-gated entry point reads them.
  | "RUNTIME_PIPELINE_ENABLED"
  | "RUNTIME_SEMANTIC_RETRIEVAL"
  | "RUNTIME_INTENT_INTELLIGENCE"
  | "RUNTIME_FOUNDER_REASONING"
  | "RUNTIME_CONFLICT_RESOLUTION"
  | "RUNTIME_PRIVACY_PROTECTION"
  // Stage 8 — Production Integration, Phase 4 (Website Integration).
  // Default false. Double-gated by design: `orchestrateExperience()` (the
  // LIVE customer-facing entry point) only calls the new
  // `lib/runtime/*` pipeline when BOTH this flag AND
  // `RUNTIME_PIPELINE_ENABLED` are true — two independent flags that must
  // both be flipped, not one. Flipping this flag alone does nothing;
  // flipping `RUNTIME_PIPELINE_ENABLED` alone (as Stage 6C already
  // allowed, for staff-only `actions/runtime.ts` testing) does not, by
  // itself, touch live customer traffic either. This is the actual
  // go-live switch for real customers — treat it with the same weight as
  // a production deploy step, never flip it casually.
  | "WEBSITE_RUNTIME_INTEGRATION_ENABLED"
  // Phase 6.1 — Controlled Product Search Pilot. Default false. Gates a
  // THIRD `orchestrateExperience()` branch (`lib/gateway/pilot/product-
  // search-pilot.ts`), independent of the Stage 8 runtime-pipeline flags
  // above — enabling this does not enable RUNTIME_PIPELINE_ENABLED or
  // WEBSITE_RUNTIME_INTEGRATION_ENABLED, and vice versa. Wires exactly one
  // capability (Commerce Intelligence's `searchProducts`) into the live
  // turn path through the existing Security Dispatcher, grounds every
  // provider reply in real tool results only, and falls back to the
  // unchanged legacy path on any failure (no configured provider, tool
  // denial, or generation error) — same "no regression" discipline as the
  // runtime pipeline flags.
  | "PILOT_PRODUCT_SEARCH_ENABLED";

export type FeatureFlags = Record<FeatureFlagKey, boolean>;

// ---------------------------------------------------------------------------
// System Diagnostics
// ---------------------------------------------------------------------------

export type DiagnosticCategory = "MODULES_LOADED" | "DEPENDENCIES" | "CONFIGURATION" | "VERSION" | "REFERENCES";

export type DiagnosticCheck = {
  category: DiagnosticCategory;
  passed: boolean;
  message: string;
};

export type DiagnosticsReport = {
  overallStatus: "PASS" | "WARN" | "FAIL";
  checks: DiagnosticCheck[];
  generatedAt: string;
};

// ---------------------------------------------------------------------------
// Security Validator
// ---------------------------------------------------------------------------

export type SecurityCheckArea =
  | "AUTHENTICATION_BOUNDARIES"
  | "STAFF_ACTIONS"
  | "CUSTOMER_ACTIONS"
  | "PERMISSION_INTEGRITY"
  | "SAFETY_ENFORCEMENT"
  | "RESPONSE_LEAKAGE"
  | "TRUSTED_INPUT_VALIDATION";

export type SecurityCheck = {
  area: SecurityCheckArea;
  passed: boolean;
  detail: string;
};

export type SecurityReport = {
  overallStatus: "PASS" | "WARN" | "FAIL";
  checks: SecurityCheck[];
  generatedAt: string;
};

// ---------------------------------------------------------------------------
// Performance Validator
// ---------------------------------------------------------------------------

export type ModuleTiming = { module: string; durationMs: number };

export type PerformanceReport = {
  pipelineLatencyMs: number;
  moduleTimings: ModuleTiming[];
  memoryUsageMb: number;
  responseSizeBytes: number;
  executionStages: string[];
  withinThresholds: boolean;
  generatedAt: string;
};

// ---------------------------------------------------------------------------
// Deployment Validator
// ---------------------------------------------------------------------------

export type DeploymentCheck = {
  area: "ENVIRONMENT_CONFIGURATION" | "REQUIRED_VARIABLES" | "REQUIRED_SERVICES" | "DATABASE_READINESS" | "BUILD_READINESS" | "STARTUP_VALIDATION";
  passed: boolean;
  detail: string;
};

export type DeploymentReadinessReport = {
  ready: boolean;
  checks: DeploymentCheck[];
  generatedAt: string;
};

// ---------------------------------------------------------------------------
// Governance Manager
// ---------------------------------------------------------------------------

export type FounderApprovalStatus = "APPROVED" | "PENDING_REVIEW" | "CORRECTED_AND_APPROVED";

export type GovernanceStatus = {
  activeVersion: string;
  approvedModules: string[];
  frozenModules: string[];
  founderApprovalStatus: Record<string, FounderApprovalStatus>;
  deploymentStatus: "READY" | "NOT_READY";
  upgradeReadiness: string;
  generatedAt: string;
};

// ---------------------------------------------------------------------------
// Audit Builder
// ---------------------------------------------------------------------------

export type AuditReport = {
  moduleStatus: Record<string, "FROZEN" | "IN_PROGRESS">;
  health: SystemHealthReport;
  security: SecurityReport;
  performance: PerformanceReport;
  governance: GovernanceStatus;
  version: VersionRegistry;
  readiness: DeploymentReadinessReport;
  generatedAt: string;
};
