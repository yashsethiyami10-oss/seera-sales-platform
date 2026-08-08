"use server";

import { requireStaff, requireAdmin } from "@/lib/rbac";
import { toErrorResponse } from "@/lib/errors";
import { updateFeatureFlagsSchema } from "@/lib/validations/production";
import { getSystemHealth as runGetSystemHealth } from "@/lib/production/health-monitor";
import { runDiagnostics as runRunDiagnostics } from "@/lib/production/diagnostics";
import { validateDeployment as runValidateDeployment } from "@/lib/production/deployment-validator";
import { generateAudit as runGenerateAudit } from "@/lib/production/audit-builder";
import { getVersionRegistry as runGetVersionRegistry } from "@/lib/production/version-registry";
import { getFeatureFlags as runGetFeatureFlags, updateFeatureFlags as runUpdateFeatureFlags } from "@/lib/production/feature-flags";
import { getGovernanceStatus as runGetGovernanceStatus } from "@/lib/production/governance-manager";

/**
 * MUV AI — Production Readiness & AI Governance (Module 9). Every action
 * is staff-or-higher-gated — this is operational/founder tooling, never a
 * customer-facing surface, so there is no ungated tier the way Module 8
 * had one. Two RBAC tiers within that:
 *
 * - `requireStaff()` — operational visibility any staff member should be
 *   able to see: health, diagnostics, version, feature flags.
 * - `requireAdmin()` — founder-level concerns: deployment readiness, the
 *   full audit report, governance status, and the one mutation
 *   (`updateFeatureFlags`) — mirroring `CLAUDE.md`'s own
 *   `requireAdmin()` guidance ("destructive or business-sensitive
 *   actions").
 *
 * 7 of these 8 actions are read-only. `updateFeatureFlags` is the sole,
 * deliberate exception — see `lib/production/feature-flags.ts` for why an
 * in-memory override, not a new table, backs it.
 */

export async function getSystemHealth() {
  try {
    await requireStaff();
    const health = await runGetSystemHealth();
    return { success: true as const, data: { health } };
  } catch (err) {
    return toErrorResponse(err);
  }
}

export async function runDiagnostics() {
  try {
    await requireStaff();
    const diagnostics = await runRunDiagnostics();
    return { success: true as const, data: { diagnostics } };
  } catch (err) {
    return toErrorResponse(err);
  }
}

export async function validateDeployment() {
  try {
    await requireAdmin();
    const deployment = await runValidateDeployment();
    return { success: true as const, data: { deployment } };
  } catch (err) {
    return toErrorResponse(err);
  }
}

export async function generateAudit() {
  try {
    await requireAdmin();
    const audit = await runGenerateAudit();
    return { success: true as const, data: { audit } };
  } catch (err) {
    return toErrorResponse(err);
  }
}

export async function getVersionRegistry() {
  try {
    await requireStaff();
    const version = runGetVersionRegistry();
    return { success: true as const, data: { version } };
  } catch (err) {
    return toErrorResponse(err);
  }
}

export async function getFeatureFlags() {
  try {
    await requireStaff();
    const flags = runGetFeatureFlags();
    return { success: true as const, data: { flags } };
  } catch (err) {
    return toErrorResponse(err);
  }
}

export async function updateFeatureFlags(input: unknown) {
  try {
    await requireAdmin();
    const data = updateFeatureFlagsSchema.parse(input);
    const flags = runUpdateFeatureFlags(data);
    return { success: true as const, data: { flags } };
  } catch (err) {
    return toErrorResponse(err);
  }
}

export async function getGovernanceStatus() {
  try {
    await requireAdmin();
    const governance = await runGetGovernanceStatus();
    return { success: true as const, data: { governance } };
  } catch (err) {
    return toErrorResponse(err);
  }
}
