import fs from "fs";
import path from "path";
import { requireStaff, requireAdmin, requireCustomer, requireUser } from "@/lib/rbac";
import type { SecurityCheck, SecurityReport } from "./types";

/**
 * MUV AI — Production Readiness (Module 9) Security Validator.
 *
 * "No penetration testing." This performs static, deterministic
 * self-checks over this codebase's own source text — never a live attack,
 * never a network call. It re-confirms structural guarantees prior
 * modules already established (e.g. Module 8's tested safety boundary,
 * Module 7's founder-corrected short-circuit) haven't silently regressed,
 * the same "grep the source, don't trust memory" discipline every
 * module's own testing.md has used throughout this project.
 */

function readSource(relativePath: string): string {
  return fs.readFileSync(path.join(process.cwd(), relativePath), "utf-8");
}

/** Extracts the source slice for one `export async function NAME(` — from
 * its own declaration up to the next top-level `export async function` (or
 * EOF). Sufficient for this codebase's consistent one-function-per-export
 * style; not a real parser. */
function sliceFunctionBody(source: string, functionName: string): string | null {
  const marker = `export async function ${functionName}(`;
  const start = source.indexOf(marker);
  if (start === -1) return null;
  const nextExportMatch = source.slice(start + marker.length).search(/export async function /);
  const end = nextExportMatch === -1 ? source.length : start + marker.length + nextExportMatch;
  return source.slice(start, end);
}

function checkAuthenticationBoundaries(): SecurityCheck {
  const guards: [string, unknown][] = [
    ["requireStaff", requireStaff],
    ["requireAdmin", requireAdmin],
    ["requireCustomer", requireCustomer],
    ["requireUser", requireUser],
  ];
  const missing = guards.filter(([, fn]) => typeof fn !== "function").map(([name]) => name);
  return {
    area: "AUTHENTICATION_BOUNDARIES",
    passed: missing.length === 0,
    detail: missing.length === 0 ? "All 4 RBAC guard functions are present and callable." : `Missing RBAC guard(s): ${missing.join(", ")}`,
  };
}

function checkStaffActions(): SecurityCheck {
  const files = ["actions/intelligence.ts", "actions/execution.ts"];
  const violations: string[] = [];
  for (const file of files) {
    const source = readSource(file);
    const exportedNames = [...source.matchAll(/export async function (\w+)\(/g)].map((m) => m[1]).filter((n): n is string => !!n);
    for (const name of exportedNames) {
      const body = sliceFunctionBody(source, name);
      if (!body || !body.includes("requireStaff()")) violations.push(`${file}:${name}`);
    }
  }
  return {
    area: "STAFF_ACTIONS",
    passed: violations.length === 0,
    detail: violations.length === 0 ? "Every action in actions/intelligence.ts and actions/execution.ts calls requireStaff()." : `Action(s) missing requireStaff(): ${violations.join(", ")}`,
  };
}

const EXPERIENCE_CUSTOMER_ACTIONS = ["startSession", "closeSession", "orchestrateExperience", "adaptForWebsite", "captureFeedback"];
const EXPERIENCE_STAFF_ACTIONS = ["prepareHandoff", "prepareAnalyticsEvents", "prepareReviewPackage"];

function checkCustomerActions(): SecurityCheck {
  const source = readSource("actions/experience.ts");
  const violations: string[] = [];

  for (const name of EXPERIENCE_CUSTOMER_ACTIONS) {
    const body = sliceFunctionBody(source, name);
    if (body && (body.includes("requireStaff()") || body.includes("requireAdmin()"))) {
      violations.push(`${name} is customer-facing but calls a staff guard`);
    }
  }
  for (const name of EXPERIENCE_STAFF_ACTIONS) {
    const body = sliceFunctionBody(source, name);
    if (!body || !body.includes("requireStaff()")) {
      violations.push(`${name} is expected to be staff-gated but does not call requireStaff()`);
    }
  }

  return {
    area: "CUSTOMER_ACTIONS",
    passed: violations.length === 0,
    detail: violations.length === 0 ? "actions/experience.ts's customer/staff RBAC split matches its documented design." : violations.join("; "),
  };
}

function checkPermissionIntegrity(): SecurityCheck {
  const source = readSource("lib/rbac.ts");
  const expectedRoles = ["ADMIN", "STAFF", "CUSTOMER"];
  const missing = expectedRoles.filter((role) => !source.includes(`"${role}"`));
  return {
    area: "PERMISSION_INTEGRITY",
    passed: missing.length === 0,
    detail: missing.length === 0 ? "All 3 roles (ADMIN, STAFF, CUSTOMER) are referenced in lib/rbac.ts." : `Role(s) not found in lib/rbac.ts: ${missing.join(", ")}`,
  };
}

function checkSafetyEnforcement(): SecurityCheck {
  const source = readSource("lib/execution/execution-orchestrator.ts");
  const hasShortCircuitCheck = source.includes('safety.outcome === "BLOCKED"') && source.includes('safety.outcome === "RESTRICTED"');
  const hasShortCircuitBuilder = source.includes("buildSafetyShortCircuitPackage");
  const passed = hasShortCircuitCheck && hasShortCircuitBuilder;
  return {
    area: "SAFETY_ENFORCEMENT",
    passed,
    detail: passed
      ? "Module 7's post-founder-review BLOCKED/RESTRICTED short-circuit is present in execution-orchestrator.ts."
      : "Module 7's safety short-circuit logic could not be confirmed in execution-orchestrator.ts — possible regression.",
  };
}

const FORBIDDEN_RESPONSE_MODEL_SUBSTRINGS = ["safety.reasons", ".safetyNotes", ".violations", "responseBlueprint.restrictions", "responseBlueprint.escalationNotice", "blueprint.intent"];

/** Strips `/* ... *\/` block comments and `// ...` line comments before a
 * forbidden-substring scan. response-model.ts's own doc comment explains,
 * in prose, exactly which internal fields it avoids — which means the
 * literal field-access substrings this check searches for legitimately
 * appear in that comment. Scanning comments would produce a permanent
 * false positive on the file's own (accurate) documentation of its
 * safety boundary, not a real leak — this is a deliberately code-only
 * check, not a full parser, sufficient for this static self-check. */
function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
}

function checkResponseLeakage(): SecurityCheck {
  const source = stripComments(readSource("lib/experience/response-model.ts"));
  const leaks = FORBIDDEN_RESPONSE_MODEL_SUBSTRINGS.filter((s) => source.includes(s));
  return {
    area: "RESPONSE_LEAKAGE",
    passed: leaks.length === 0,
    detail: leaks.length === 0 ? "response-model.ts does not reference any known internal-only field." : `Potential leakage — response-model.ts references: ${leaks.join(", ")}`,
  };
}

/** Module 9's own actions (`actions/production.ts`) are mostly no-argument
 * operational status queries — `getSystemHealth()`, `runDiagnostics()`,
 * etc. take nothing from the caller, so there is nothing for them to
 * validate. Only `updateFeatureFlags(input)` accepts genuine caller
 * -supplied data; it is checked by name instead of by blanket export scan,
 * unlike the other 3 files below, which follow every prior module's
 * uniform `functionName(input: unknown)` convention. */
const PRODUCTION_ACTIONS_WITH_INPUT = ["updateFeatureFlags"];

function checkTrustedInputValidation(): SecurityCheck {
  const uniformInputFiles = ["actions/intelligence.ts", "actions/execution.ts", "actions/experience.ts"];
  const violations: string[] = [];
  for (const file of uniformInputFiles) {
    const source = readSource(file);
    const exportedNames = [...source.matchAll(/export async function (\w+)\(/g)].map((m) => m[1]).filter((n): n is string => !!n);
    for (const name of exportedNames) {
      const body = sliceFunctionBody(source, name);
      if (!body || !body.includes(".parse(")) violations.push(`${file}:${name}`);
    }
  }

  const productionSource = readSource("actions/production.ts");
  for (const name of PRODUCTION_ACTIONS_WITH_INPUT) {
    const body = sliceFunctionBody(productionSource, name);
    if (!body || !body.includes(".parse(")) violations.push(`actions/production.ts:${name}`);
  }

  return {
    area: "TRUSTED_INPUT_VALIDATION",
    passed: violations.length === 0,
    detail: violations.length === 0 ? "Every action that accepts caller-supplied input parses it through a Zod schema." : `Action(s) missing schema validation: ${violations.join(", ")}`,
  };
}

export function runSecurityValidation(): SecurityReport {
  const checks: SecurityCheck[] = [
    checkAuthenticationBoundaries(),
    checkStaffActions(),
    checkCustomerActions(),
    checkPermissionIntegrity(),
    checkSafetyEnforcement(),
    checkResponseLeakage(),
    checkTrustedInputValidation(),
  ];

  const failed = checks.filter((c) => !c.passed);
  const overallStatus: SecurityReport["overallStatus"] = failed.length === 0 ? "PASS" : failed.some((c) => c.area === "SAFETY_ENFORCEMENT" || c.area === "RESPONSE_LEAKAGE") ? "FAIL" : "WARN";

  return { overallStatus, checks, generatedAt: new Date().toISOString() };
}
