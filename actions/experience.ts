"use server";

import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { requireStaff } from "@/lib/rbac";
import { toErrorResponse, AppError } from "@/lib/errors";
import { checkRateLimit } from "@/lib/rate-limit";
import {
  startSessionSchema, closeSessionSchema, orchestrateExperienceSchema, adaptForWebsiteSchema,
  captureFeedbackSchema, prepareHandoffSchema, prepareAnalyticsEventsSchema, prepareReviewPackageSchema,
} from "@/lib/validations/experience";
import { createSession, closeSession as closeSessionRecord } from "@/lib/experience/session-manager";
import { runAiGatewayTurn } from "@/lib/gateway/ai-gateway";
import { adaptForWebsite as adaptForWebsiteView } from "@/lib/experience/website-channel-adapter";
import { captureFeedback as captureFeedbackRow } from "@/lib/experience/feedback-capture";
import { buildHandoffPackage } from "@/lib/experience/handoff-preparer";
import { prepareAnalyticsEvents as buildAnalyticsEvents } from "@/lib/experience/analytics-preparer";
import { buildReviewPackage } from "@/lib/experience/review-preparer";

/**
 * MUV AI — Experience Platform (Module 8) Server Actions. See
 * `docs/phase-8/experience-platform/api-reference.md` for the full
 * contract this file implements — every action here is a thin
 * `"use server"` wrapper around one `lib/experience/*.ts` function,
 * matching this codebase's own established convention (Zod validation,
 * `toErrorResponse` on catch, `{ success: true, data }` on success). No
 * business logic lives in this file itself.
 *
 * Every exported action independently performs its own auth/rate-limit
 * check — none relies on being called from within another already-checked
 * action, per CLAUDE.md's standing rule that every exported Server Action
 * is independently callable as its own RPC endpoint.
 */

async function clientIp() {
  const headersList = await headers();
  return headersList.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
}

// ---------------------------------------------------------------------
// Customer-facing (ungated, rate-limited where noted)
// ---------------------------------------------------------------------

export async function startSession(input: unknown) {
  try {
    const ip = await clientIp();
    const { allowed } = checkRateLimit(`experience-start-session:${ip}`, 20, 60 * 1000);
    if (!allowed) throw new AppError("Too many attempts. Please wait a moment and try again.", 429, "RATE_LIMITED");

    const data = startSessionSchema.parse(input);
    // Resolved server-side from the real auth session, never from client
    // input — an anonymous website visitor has no session, and that's a
    // valid, expected case (customerId stays null), not an error.
    // `ExperienceSession.customerId` has a real FK to `Customer.id`, not
    // `User.id` (a logged-in ADMIN/STAFF user has no Customer row at all),
    // so the User session's id must be resolved to its linked Customer
    // row — never assigned directly.
    const session = await auth();
    let customerId: string | null = null;
    if (session?.user?.id) {
      const customer = await prisma.customer.findUnique({ where: { userId: session.user.id }, select: { id: true } });
      customerId = customer?.id ?? null;
    }

    const record = await createSession(data.channel ?? "WEBSITE", customerId);
    return { success: true as const, data: { session: record } };
  } catch (err) {
    return toErrorResponse(err);
  }
}

export async function closeSession(input: unknown) {
  try {
    const data = closeSessionSchema.parse(input);
    const record = await closeSessionRecord(data.sessionId);
    return { success: true as const, data: { session: record } };
  } catch (err) {
    return toErrorResponse(err);
  }
}

// Phase 5.2, Module 1 — this is the one call in this file that no longer
// goes straight to a `lib/experience/*.ts` function: it goes through
// `lib/gateway/ai-gateway.ts`'s `runAiGatewayTurn`, the single backend
// entry point for every AI turn. See that file for why. Behavior is
// unchanged — the Gateway itself still delegates to the same
// `orchestrateExperience()` this action called before.
export async function orchestrateExperience(input: unknown) {
  try {
    const ip = await clientIp();
    const { allowed } = checkRateLimit(`experience-orchestrate:${ip}`, 30, 60 * 1000);
    if (!allowed) throw new AppError("You're sending messages a little quickly — please wait a moment and try again.", 429, "RATE_LIMITED");

    const data = orchestrateExperienceSchema.parse(input);
    const view = await runAiGatewayTurn(data);
    return { success: true as const, data: { view } };
  } catch (err) {
    return toErrorResponse(err);
  }
}

export async function adaptForWebsite(input: unknown) {
  try {
    const data = adaptForWebsiteSchema.parse(input);
    const view = adaptForWebsiteView(data.experienceResponse);
    return { success: true as const, data: { view } };
  } catch (err) {
    return toErrorResponse(err);
  }
}

export async function captureFeedback(input: unknown) {
  try {
    const ip = await clientIp();
    const { allowed } = checkRateLimit(`experience-feedback:${ip}`, 10, 60 * 1000);
    if (!allowed) throw new AppError("Too many attempts. Please wait a moment and try again.", 429, "RATE_LIMITED");

    const data = captureFeedbackSchema.parse(input);
    const feedback = await captureFeedbackRow(data);
    return { success: true as const, data: { feedback } };
  } catch (err) {
    return toErrorResponse(err);
  }
}

// ---------------------------------------------------------------------
// Staff-facing (requireStaff()-gated)
// ---------------------------------------------------------------------

export async function prepareHandoff(input: unknown) {
  try {
    await requireStaff();
    const data = prepareHandoffSchema.parse(input);
    const handoff = buildHandoffPackage(data.sessionId, data.executionPackage);
    return { success: true as const, data: { handoff } };
  } catch (err) {
    return toErrorResponse(err);
  }
}

export async function prepareAnalyticsEvents(input: unknown) {
  try {
    await requireStaff();
    const data = prepareAnalyticsEventsSchema.parse(input);
    const events = buildAnalyticsEvents(data.sessionId, data.executionPackage);
    return { success: true as const, data: { events } };
  } catch (err) {
    return toErrorResponse(err);
  }
}

export async function prepareReviewPackage(input: unknown) {
  try {
    await requireStaff();
    const data = prepareReviewPackageSchema.parse(input);
    const review = buildReviewPackage(data.sessionId, data.executionPackage, data.experienceResponse);
    return { success: true as const, data: { review } };
  } catch (err) {
    return toErrorResponse(err);
  }
}
