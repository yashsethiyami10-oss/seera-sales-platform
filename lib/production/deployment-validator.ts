import { prisma } from "@/lib/prisma";
import { validateEnv } from "@/lib/env";
import type { DeploymentCheck, DeploymentReadinessReport } from "./types";

/**
 * MUV AI — Production Readiness (Module 9) Deployment Validator.
 *
 * "Verify... Do not deploy automatically." Every check here is read-only
 * observation of the *current* running process/environment — nothing
 * triggers a build, a migration, or a deploy. Optional integrations
 * (Cloudinary, Razorpay, Resend, shipping/messaging providers) are
 * reported as configured/not-configured, never treated as failures —
 * `CLAUDE.md`'s own documented reasoning is that each already fails
 * gracefully at its own call site.
 */

const OPTIONAL_INTEGRATION_VARS = [
  "GOOGLE_CLIENT_ID", "CLOUDINARY_URL", "RAZORPAY_KEY_ID", "RESEND_API_KEY",
  "SHIPPING_PROVIDER", "MESSAGING_PROVIDER",
];

function checkEnvironmentConfiguration(): DeploymentCheck {
  const configured = OPTIONAL_INTEGRATION_VARS.filter((v) => !!process.env[v]);
  return {
    area: "ENVIRONMENT_CONFIGURATION",
    passed: true,
    detail: `${configured.length}/${OPTIONAL_INTEGRATION_VARS.length} optional integration variable(s) configured: ${configured.length ? configured.join(", ") : "none"}.`,
  };
}

function checkRequiredVariables(): DeploymentCheck {
  const { ok, missing } = validateEnv();
  return {
    area: "REQUIRED_VARIABLES",
    passed: ok,
    detail: ok ? "All unconditionally-required environment variables are set." : `Missing: ${missing.join(", ")}`,
  };
}

async function checkRequiredServices(): Promise<DeploymentCheck> {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return { area: "REQUIRED_SERVICES", passed: true, detail: "Database connection succeeded." };
  } catch (err) {
    return { area: "REQUIRED_SERVICES", passed: false, detail: `Database connection failed: ${err instanceof Error ? err.message : "unknown error"}` };
  }
}

async function checkDatabaseReadiness(): Promise<DeploymentCheck> {
  try {
    await prisma.user.count();
    return { area: "DATABASE_READINESS", passed: true, detail: "Core schema is applied — User table is queryable." };
  } catch (err) {
    return { area: "DATABASE_READINESS", passed: false, detail: `Schema does not appear to be applied: ${err instanceof Error ? err.message : "unknown error"}` };
  }
}

function checkBuildReadiness(): DeploymentCheck {
  // This code is only running because a build already succeeded (Next.js
  // would not have started otherwise) — there is no separate "build
  // readiness" signal to check live, at runtime, from inside a Server
  // Action. Build/typecheck validation happens via `npm run build`/
  // `tsc --noEmit`, not here — see testing.md for the actual results.
  return {
    area: "BUILD_READINESS",
    passed: true,
    detail: "Not independently re-checked at runtime — this process is only running because `npm run build` already succeeded. See testing.md for the actual build verification run for this module.",
  };
}

function checkStartupValidation(): DeploymentCheck {
  const { ok, missing } = validateEnv();
  return {
    area: "STARTUP_VALIDATION",
    passed: ok,
    detail: ok ? "lib/env.ts's validateEnv() reports no missing required variables." : `validateEnv() reports missing: ${missing.join(", ")}`,
  };
}

export async function validateDeployment(): Promise<DeploymentReadinessReport> {
  const checks: DeploymentCheck[] = [
    checkEnvironmentConfiguration(),
    checkRequiredVariables(),
    await checkRequiredServices(),
    await checkDatabaseReadiness(),
    checkBuildReadiness(),
    checkStartupValidation(),
  ];

  return { ready: checks.every((c) => c.passed), checks, generatedAt: new Date().toISOString() };
}
