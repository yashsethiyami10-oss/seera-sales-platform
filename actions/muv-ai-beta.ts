"use server";

import { headers } from "next/headers";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { requireAdmin } from "@/lib/rbac";
import { toErrorResponse, AppError, NotFoundError } from "@/lib/errors";
import { checkRateLimit } from "@/lib/rate-limit";
import { logger } from "@/lib/logger";
import { getVersionRegistry } from "@/lib/production/version-registry";
import { getSession } from "@/lib/experience/session-manager";
import { getAvailability as getCommerceAvailability } from "@/lib/gateway/commerce/commerce-api";
import {
  submitMuvAiFeedbackSchema, requestMuvAiHandoffSchema, logMuvAiEventSchema, getMuvAiTurnDiagnosticsSchema,
} from "@/lib/validations/muv-ai-beta";

// ---------------------------------------------------------------------------
// Session restoration validity check — reuses Module 8's own exported
// `getSession()` (lib/experience/session-manager.ts, frozen, unmodified),
// which already performs the authoritative lazy-expiry check (30-minute
// inactivity TTL). This avoids re-implementing that logic here — "do not
// duplicate business logic," "reuse existing authoritative models and
// services wherever available." Read-only: getSession() never mutates
// except to flip a stale ACTIVE row to EXPIRED, which is itself Module 8's
// own established, frozen behavior, not new mutation this file introduces.
// ---------------------------------------------------------------------------

export async function validateMuvAiSession(sessionId: string) {
  try {
    if (!sessionId || typeof sessionId !== "string") return { success: true as const, data: { valid: false } };
    const session = await getSession(sessionId);
    return { success: true as const, data: { valid: session.status === "ACTIVE" } };
  } catch {
    // Not found / inaccessible — fail closed, never surface the underlying
    // error to a caller who is only asking "is this still good?"
    return { success: true as const, data: { valid: false } };
  }
}

/**
 * MUV AI Website Integration — Wave 2. New, Wave-2-owned Server Actions
 * only. Nothing here modifies, wraps, or re-implements any frozen Module
 * 1-9 file (`actions/experience.ts`, `lib/experience/*`,
 * `lib/intelligence/*`, `lib/execution/*`, `lib/retrieval/*` are all
 * untouched) — Experience remains the only AI pipeline entry point.
 * These actions only handle Wave-2-specific concerns (feedback, handoff,
 * diagnostics formatting, event logging) that sit alongside the frozen
 * pipeline, never inside it.
 *
 * RBAC shape: customer-facing/ungated + rate-limited for
 * feedback/handoff/support-contact/events (same bearer-token session
 * -ownership trust model Wave 1 established), `requireAdmin()`-gated for
 * diagnostics (founder-only, never available to ordinary customers,
 * enforced server-side — never a client-side or env-var check).
 */

async function rateLimitByIp(key: string, limit: number, windowMs: number) {
  const headersList = await headers();
  const ip = headersList.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  const { allowed } = checkRateLimit(`${key}:${ip}`, limit, windowMs);
  if (!allowed) throw new AppError("Too many requests. Please wait a moment and try again.", 429, "RATE_LIMITED");
}

// ---------------------------------------------------------------------------
// Feedback — reuses Module 8's existing ExperienceFeedback table
// (additive `turnReference` column only; no frozen file touched).
// ---------------------------------------------------------------------------

export async function submitMuvAiFeedback(input: unknown) {
  try {
    await rateLimitByIp("muv-ai-feedback", 20, 60 * 1000);
    const data = submitMuvAiFeedbackSchema.parse(input);

    const session = await prisma.experienceSession.findUnique({ where: { id: data.sessionId }, select: { id: true } });
    if (!session) throw new NotFoundError("Session");

    // Upsert on the (sessionId, turnReference) unique key: first submission
    // for a turn creates the row (append-only, the common case); a second
    // submission for the same turn — the customer changed their mind —
    // corrects the existing row instead of creating a duplicate. Never
    // touches the row's own createdAt, so "when feedback was first given"
    // stays intact even after a correction.
    const rating = data.helpful ? 5 : 1;
    const feedback = await prisma.experienceFeedback.upsert({
      where: { sessionId_turnReference: { sessionId: data.sessionId, turnReference: data.turnReference } },
      create: { sessionId: data.sessionId, turnReference: data.turnReference, rating },
      update: { rating },
    });

    return { success: true as const, data: { id: feedback.id, helpful: data.helpful } };
  } catch (err) {
    return toErrorResponse(err);
  }
}

// ---------------------------------------------------------------------------
// Human handoff — additive fields on Module 8's existing ExperienceSession
// (no frozen file touched); "strongest capability safely supported" per
// the audit: a real persisted request, not just a static link.
// ---------------------------------------------------------------------------

export async function requestMuvAiHandoff(input: unknown) {
  try {
    await rateLimitByIp("muv-ai-handoff", 5, 60 * 1000);
    const data = requestMuvAiHandoffSchema.parse(input);

    const session = await prisma.experienceSession.findUnique({ where: { id: data.sessionId }, select: { id: true } });
    if (!session) throw new NotFoundError("Session");

    await prisma.experienceSession.update({
      where: { id: data.sessionId },
      data: {
        handoffRequestedAt: new Date(),
        handoffContactEmail: data.contactEmail ?? null,
        handoffContactPhone: data.contactPhone ?? null,
        handoffMessage: data.message ?? null,
      },
    });

    logger.info("muv-ai:handoff-requested", { sessionId: data.sessionId });
    return { success: true as const, data: { persisted: true as const } };
  } catch (err) {
    // Truthful failure — the caller must never be told a request was
    // persisted when it wasn't.
    return toErrorResponse(err);
  }
}

/** Public, already-customer-facing contact info (the same fields the
 * storefront's own /contact page would show) — no gating needed, nothing
 * new or sensitive. Only returns fields that are actually configured. */
export async function getMuvAiSupportContact() {
  try {
    const settings = await prisma.storeSettings.findFirst({
      select: { supportEmail: true, supportPhone: true, whatsappNumber: true },
    });
    return {
      success: true as const,
      data: {
        supportEmail: settings?.supportEmail ?? null,
        supportPhone: settings?.supportPhone ?? null,
        whatsappNumber: settings?.whatsappNumber ?? null,
      },
    };
  } catch (err) {
    return toErrorResponse(err);
  }
}

// ---------------------------------------------------------------------------
// Operational analytics — new, minimal MuvAiEvent table. Best-effort:
// never lets a logging failure surface to the caller.
// ---------------------------------------------------------------------------

export async function logMuvAiEvent(input: unknown) {
  try {
    await rateLimitByIp("muv-ai-event", 60, 60 * 1000);
    const data = logMuvAiEventSchema.parse(input);
    await prisma.muvAiEvent.create({
      data: { type: data.type, sessionId: data.sessionId ?? null, properties: data.properties ?? {} },
    });
    return { success: true as const };
  } catch (err) {
    // "Keep analytics failure non-blocking" — logged server-side, never
    // thrown back to a caller that's mid-conversation.
    logger.warn("muv-ai:event-log-failed", { error: err instanceof Error ? err.message : String(err) });
    return { success: true as const };
  }
}

// ---------------------------------------------------------------------------
// Founder-only diagnostics — requireAdmin()-gated. Formats and audits data
// the caller's own browser already safely received from Module 8's
// authoritative WebsiteExperienceView; never re-runs the AI pipeline,
// never exposes a field Module 8 doesn't already return (see
// known-limitations: confidence classification is not available here
// because exposing it would require modifying frozen Module 8 files).
// ---------------------------------------------------------------------------

export async function checkMuvAiDiagnosticsAccess() {
  try {
    const session = await auth();
    return { success: true as const, data: { isAuthorized: session?.user?.role === "ADMIN" } };
  } catch {
    return { success: true as const, data: { isAuthorized: false } };
  }
}

function truncateId(id: string): string {
  return id.length <= 10 ? id : `${id.slice(0, 8)}…`;
}

export async function getMuvAiTurnDiagnostics(input: unknown) {
  try {
    const admin = await requireAdmin();
    const data = getMuvAiTurnDiagnosticsSchema.parse(input);

    const version = getVersionRegistry();
    const referenceCardCount = data.segmentKinds.filter((k) => k === "REFERENCE_CARD").length;

    const snapshot = {
      sessionId: truncateId(data.sessionId),
      turnId: truncateId(data.generatedAt),
      executionStatus: data.executionStatus,
      escalationStatus: data.requiresHandoff ? ("REQUIRED" as const) : ("NOT_REQUIRED" as const),
      allowFollowUp: data.allowFollowUp,
      retrievedSourceCountProxy: referenceCardCount,
      responseSegmentTypes: Array.from(new Set(data.segmentKinds)),
      processingDurationMs: Math.round(data.durationMs),
      architectureVersion: version.architectureVersion,
      aiVersion: version.aiVersion,
    };

    // "Audit every diagnostic access if the existing audit system supports
    // it" — it does (SalesAuditLog, Module: "Sales Architecture" but
    // generic by design via its own `module` string field).
    await prisma.salesAuditLog.create({
      data: {
        userId: admin.id,
        module: "muv-ai-wave2",
        action: "DIAGNOSTICS_VIEWED",
        recordType: "ExperienceSession",
        recordId: data.sessionId,
      },
    }).catch((err) => logger.warn("muv-ai:diagnostics-audit-failed", { error: err instanceof Error ? err.message : String(err) }));

    return { success: true as const, data: { snapshot } };
  } catch (err) {
    return toErrorResponse(err);
  }
}

// ---------------------------------------------------------------------------
// Product card data — Experience v2.0 UX refinement. A REFERENCE_CARD
// segment carries Module 5/7's own `SourceReference` shape, unchanged:
// `{ referenceType: "PRODUCT_INTELLIGENCE" | "PRODUCT" | ..., id }`. Two of
// those reference types resolve to a real product:
//   - "PRODUCT"              — id IS the Product id directly
//     (lib/retrieval/sources.ts, lib/retrieval/relationships.ts)
//   - "PRODUCT_INTELLIGENCE" — id is a ProductIntelligence id; resolved via
//     its existing 1:1 `productId` relation (not a new relation)
// Anything else (KNOWLEDGE, PROBLEM_INTELLIGENCE, CARE_INTELLIGENCE) is not
// a product reference and returns no card. Read-only, public (product
// name/price/images are already public storefront data); "never invent
// product information" is satisfied structurally — every field returned is
// a direct Prisma select, nothing composed or guessed. Does not touch
// Intelligence, Retrieval, Execution, or Experience — this only runs
// *after* Module 7 has already decided a product reference belongs in the
// response; it never influences that decision.
// ---------------------------------------------------------------------------

export type MuvAiProductCard = {
  id: string;
  slug: string;
  name: string;
  shortDescription: string | null;
  image: string | null;
  price: number | null;
  mrp: number | null;
  variantId: string | null;
};

// Production Customer Content Layer (Founder Decision, Product Content
// Architecture) is the only source of shortDescription here — the legacy
// Product.shortDescription column is no longer selected.
//
// Founder Validation & Safe UAT Activation, Block B2 — price/MRP/stock/
// variant are deliberately NOT selected here anymore. Those are commerce
// facts, sourced fresh at request time exclusively through the governed
// `commerce.getAvailability` Gateway tool (see `resolveCommercial()` below)
// rather than a direct Prisma join — "dynamic values must come from tools
// at request time, never frozen." Only catalog identity (name/slug/image/
// description/active-status) — which no commerce tool covers and which
// this card has always read directly — stays a plain Prisma select.
const PRODUCT_SELECT = {
  id: true,
  slug: true,
  name: true,
  images: true,
  status: true,
  content: { select: { shortDescription: true } },
};

/** Cheapest variant by price, matching this card's pre-B2 selection
 * behavior exactly (`orderBy price asc, take 1`, no stock filtering) —
 * only the data source changed, not which variant gets shown. Returns
 * null (graceful fallback) if the tool call fails or the product has no
 * variants, rather than throwing and breaking the whole card. */
async function resolveCommercial(productId: string): Promise<{ price: number | null; mrp: number | null; variantId: string | null }> {
  const result = await getCommerceAvailability(productId);
  const commercial = result.success ? result.data.results[0]?.commercial : undefined;
  if (!commercial?.length) return { price: null, mrp: null, variantId: null };
  const cheapest = [...commercial].sort((a, b) => a.price - b.price)[0]!;
  return { price: cheapest.price, mrp: cheapest.mrp, variantId: cheapest.variantId };
}

function toCard(
  product: { id: string; slug: string; name: string; content: { shortDescription: string | null } | null; images: string[]; status: string },
  commercial: { price: number | null; mrp: number | null; variantId: string | null }
): MuvAiProductCard | null {
  if (product.status !== "ACTIVE") return null; // never show a card for something a customer couldn't actually reach
  return {
    id: product.id,
    slug: product.slug,
    name: product.name,
    shortDescription: product.content?.shortDescription ?? null,
    image: product.images[0] ?? null,
    price: commercial.price,
    mrp: commercial.mrp,
    variantId: commercial.variantId,
  };
}

export async function getMuvAiProductCard(referenceType: string, id: string) {
  try {
    if (!id || typeof id !== "string") return { success: true as const, data: { card: null } };

    if (referenceType === "PRODUCT") {
      const product = await prisma.product.findUnique({ where: { id }, select: PRODUCT_SELECT });
      if (!product) return { success: true as const, data: { card: null } };
      const commercial = await resolveCommercial(product.id);
      return { success: true as const, data: { card: toCard(product, commercial) } };
    }

    if (referenceType === "PRODUCT_INTELLIGENCE") {
      const pi = await prisma.productIntelligence.findUnique({
        where: { id },
        select: { product: { select: PRODUCT_SELECT } },
      });
      if (!pi?.product) return { success: true as const, data: { card: null } };
      const commercial = await resolveCommercial(pi.product.id);
      return { success: true as const, data: { card: toCard(pi.product, commercial) } };
    }

    return { success: true as const, data: { card: null } };
  } catch (err) {
    return toErrorResponse(err);
  }
}

// ---------------------------------------------------------------------------
// MUV AI Engineering Execution — Sprint 14 (Website AI). `logMuvAiEvent`
// above has written to MuvAiEvent on every widget open/message/feedback
// since Wave 2 shipped; research before this sprint confirmed it was never
// once read back anywhere outside test setup/teardown — a real, disclosed-
// by-omission gap, not a hypothetical one. This is the first, minimal read:
// admin-gated (matching this file's own established requireAdmin()
// convention for every other founder/admin-tier read here), a plain
// groupBy, no new table, no change to logMuvAiEvent's write path.
// ---------------------------------------------------------------------------

export async function getMuvAiEventSummary(days = 30) {
  try {
    await requireAdmin();
    const since = new Date(Date.now() - Math.min(365, Math.max(1, days)) * 24 * 60 * 60 * 1000);
    const rows = await prisma.muvAiEvent.groupBy({
      by: ["type"],
      where: { occurredAt: { gte: since } },
      _count: { _all: true },
      orderBy: { _count: { type: "desc" } },
    });
    const totalEvents = rows.reduce((sum, r) => sum + r._count._all, 0);
    return { success: true as const, data: { since: since.toISOString(), totalEvents, byType: rows.map((r) => ({ type: r.type, count: r._count._all })) } };
  } catch (err) {
    return toErrorResponse(err);
  }
}
