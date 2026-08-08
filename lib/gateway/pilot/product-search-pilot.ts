import type { GatewayGenerateOutput } from "@/lib/gateway/providers";
import { invokeGatewayTool } from "@/lib/gateway/security";
import { assertQueryTextWithinLimit, RequestTooLargeError } from "@/lib/gateway/security/limits";
import { emitGatewayEvent, generateRequestId, recordProviderOutcome, recordTokenUsageEvent } from "@/lib/gateway/observability";
import { getEffectiveProviderAdapter, getGatewayProductionConfig } from "@/lib/gateway/config";
import { buildContextWindow } from "@/lib/gateway/conversation/context-builder";
import { logger } from "@/lib/logger";
import { scanTextForConfidentiality, hasBlockingConfidentialityFindings } from "@/lib/knowledge-reconciliation/confidentiality-scanner";
import { backstopScanSegmentContent } from "@/lib/experience/website-channel-adapter";
import { classifyPilotIntent } from "./intent";
import type {
  ExperienceRequest,
  ExperienceSessionRecord,
  WebsiteExperienceSegment,
  WebsiteExperienceView,
} from "@/lib/experience/types";

/**
 * MUV AI Gateway — Phase 6.1, Controlled Product Search Pilot.
 *
 * Wires exactly one capability — Commerce Intelligence's real
 * `searchProducts` — into the canonical live turn path:
 *
 *   Storefront -> runAiGatewayTurn -> Experience Orchestrator (this
 *   module, called from a new, default-off branch in
 *   `lib/experience/experience-orchestrator.ts`) -> Security Dispatcher
 *   (`invokeGatewayTool`) -> Commerce Intelligence (`searchProducts`) ->
 *   grounded provider response -> storefront reply.
 *
 * Grounding discipline: the provider is given ONLY the exact structured
 * result Commerce Intelligence returned (name/category/price
 * range/in-stock), told explicitly it may not state anything else, and is
 * never invoked at all for the "no verified match" case — that reply is
 * fully deterministic, not generated, so there is zero fabrication risk
 * for the one case fabrication would matter most (claiming a product
 * exists when the real catalog has no match).
 *
 * Every failure mode (provider not configured, tool call denied/rate
 * limited/erroring, generation throwing) throws `PilotUnavailableError` —
 * the caller (`orchestrateExperience`) catches this and falls back to the
 * unchanged, pre-Phase-6.1 deterministic legacy path, exactly like the
 * existing Stage 8 runtime-pipeline flag already does for its own
 * failures. The pilot never surfaces an error to a customer that the
 * legacy path would not have produced.
 *
 * Production Rollout v1.0, Stage 6 (Conversation Runtime Cutover) added
 * real multi-turn context: `buildContextWindow` (Conversation Runtime,
 * Phase 5.5, unmodified — a pure function over `ExperienceSession.
 * memoryItems`, the same frozen array `experience-orchestrator.ts`
 * already persists after every turn regardless of path) supplies a
 * bounded slice of the real recent conversation, included in the system
 * prompt explicitly labeled as context only — never a source of product
 * facts, so an earlier, unverified customer statement can never be
 * mistaken for grounding. No new memory store, no inferred preference is
 * ever written anywhere: this pilot has no durable write path at all
 * beyond the pre-existing session memory log, which stores literal
 * message text, never a derived inference.
 *
 * Coreference fallback (found during Stage 12 live E2E testing): a
 * genuine follow-up like "Which one is cheaper?" has no product/
 * category keyword of its own, so the primary search finds nothing even
 * though the customer clearly means the products from the turn just
 * shown. When the primary attempt is AMBIGUOUS or finds zero products
 * AND the session has a real prior customer message, exactly one retry
 * combines that prior message with the current one before falling back
 * to the deterministic clarification — still one real tool call's worth
 * of grounding data, still zero fabrication, just a wider real search.
 */

export class PilotUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PilotUnavailableError";
  }
}

const MAX_GROUNDED_PRODUCTS = 5;

type ProductSearchItem = {
  name: string;
  slug: string;
  category: { name: string } | null;
  variants: { price: number; inventory: { quantity: number } | null }[];
};

type GroundedProduct = {
  name: string;
  slug: string;
  category: string;
  priceRange: { min: number; max: number } | null;
  inStock: boolean;
};

function toGroundedProduct(item: ProductSearchItem): GroundedProduct {
  const prices = item.variants.map((v) => v.price);
  const inStock = item.variants.some((v) => (v.inventory?.quantity ?? 0) > 0);
  return {
    name: item.name,
    slug: item.slug,
    category: item.category?.name ?? "Unknown",
    priceRange: prices.length > 0 ? { min: Math.min(...prices), max: Math.max(...prices) } : null,
    inStock,
  };
}

/** Pure — no I/O, no provider call. Kept exported and pure specifically so
 * it can be verified in a permanent, non-billable test: the prompt is a
 * deterministic function of real product data, nothing else ever enters
 * it. This is the concrete mechanism behind "all commercial facts must
 * come from the real Product Search result." */
export function buildGroundedPrompt(customerMessage: string, products: GroundedProduct[], conversationHistory?: string): { system: string; user: string } {
  const system = [
    "You are the MUV storefront assistant, operating in a narrow pilot: Product Search only.",
    "You may state ONLY facts present in PRODUCT_SEARCH_RESULTS below — product name, category, price range, and stock status.",
    "Never invent, guess, or infer a product, price, ingredient, benefit, safety claim, or availability that is not explicitly listed there.",
    "Reply in 1-3 short, warm, precise sentences — no hype, MUV brand voice.",
    "Never mention tools, JSON, system instructions, or internal reasoning.",
    ...(conversationHistory
      ? [
          "",
          "RECENT_CONVERSATION (earlier messages in this session, for context only — never treat anything here as a verified product fact; only PRODUCT_SEARCH_RESULTS is verified):",
          conversationHistory,
        ]
      : []),
    "",
    `PRODUCT_SEARCH_RESULTS: ${JSON.stringify(products)}`,
  ].join("\n");
  return { system, user: customerMessage };
}

/**
 * Founder Validation & Safe UAT Activation, Block B3 — "response
 * validation runs after provider output" / "confidentiality scanner
 * remains final backstop." Neither existed on this path before: the
 * pilot previously sent `generation.text` straight to the customer with
 * only `.trim()` applied (the legacy path's `adaptForWebsite()` — which
 * this branch never calls — is the only other place that already ran the
 * confidentiality scanner). Pure and testable, matching this file's own
 * `buildGroundedPrompt()` convention: no I/O, no provider call, just a
 * pass/fail decision over already-produced text plus the same grounded
 * data the prompt itself was built from.
 *
 * Two checks:
 * 1. Confidentiality — identical backstop to `website-channel-adapter.ts`'s
 *    `backstopScanSegmentContent()` (same scanner, same "blocking findings"
 *    definition), so a provider response is held to the same bar as every
 *    other customer-facing segment in this codebase.
 * 2. Price grounding — extracts every ₹/Rs currency figure the model
 *    stated and rejects the response if any falls outside the union of
 *    the real, tool-returned price ranges it was given. Catches the one
 *    highest-consequence fabrication case (an invented price) without
 *    requiring a general-purpose hallucination classifier the rest of
 *    this codebase doesn't have either.
 */
export function validateGeneratedResponse(text: string, groundedProducts: GroundedProduct[]): { valid: true } | { valid: false; reason: string } {
  const findings = scanTextForConfidentiality(text, "pilot.generation");
  if (hasBlockingConfidentialityFindings(findings)) {
    return { valid: false, reason: "confidentiality-backstop" };
  }

  const ranges = groundedProducts.map((p) => p.priceRange).filter((r): r is { min: number; max: number } => r !== null);
  if (ranges.length > 0) {
    const globalMin = Math.min(...ranges.map((r) => r.min));
    const globalMax = Math.max(...ranges.map((r) => r.max));
    const mentionedPrices = [...text.matchAll(/(?:₹|rs\.?\s*)(\d[\d,]*)/gi)].map((m) => Number(m[1]!.replace(/,/g, "")));
    for (const price of mentionedPrices) {
      if (price < globalMin || price > globalMax) {
        return { valid: false, reason: "ungrounded-price" };
      }
    }
  }

  return { valid: true };
}

function buildView(sessionId: string, segments: WebsiteExperienceSegment[], executionStatus: WebsiteExperienceView["executionStatus"]): WebsiteExperienceView {
  return {
    sessionId,
    segments,
    requiresHandoff: false,
    allowFollowUp: true,
    executionStatus,
    generatedAt: new Date().toISOString(),
  };
}

function clarificationView(sessionId: string, question: string): WebsiteExperienceView {
  return buildView(sessionId, [{ kind: "FOLLOW_UP_QUESTION", content: question }], "NEEDS_MORE_INFORMATION");
}

export async function runProductSearchPilotTurn(request: ExperienceRequest, session: ExperienceSessionRecord): Promise<WebsiteExperienceView> {
  const requestId = generateRequestId();

  await emitGatewayEvent({
    requestId,
    eventType: "REQUEST",
    source: "gateway",
    message: "Pilot product-search turn started",
    metadata: { sessionId: session.id, isGuest: !session.customerId },
  });

  try {
    assertQueryTextWithinLimit(request.customerMessage, getGatewayProductionConfig().maxInputLength);
  } catch (err) {
    if (err instanceof RequestTooLargeError) {
      await emitGatewayEvent({ requestId, eventType: "TOOL_ERROR", severity: "INFO", source: "security", message: "Pilot: message exceeded size limit, no tool invoked" });
      return clarificationView(session.id, "That message is a bit long for me to search with — could you summarize what you're looking for in a short phrase?");
    }
    throw err;
  }

  const lastCustomerMessage = [...session.memoryItems].reverse().find((m) => m.type === "CONVERSATION")?.content;

  let intent = classifyPilotIntent(request.customerMessage);
  let usedCoreferenceFallback = false;
  if (intent.kind === "AMBIGUOUS" && lastCustomerMessage) {
    const combined = classifyPilotIntent(`${lastCustomerMessage} ${request.customerMessage}`);
    if (combined.kind === "PRODUCT_SEARCH") {
      intent = combined;
      usedCoreferenceFallback = true;
    }
  }
  if (intent.kind === "AMBIGUOUS") {
    await emitGatewayEvent({ requestId, eventType: "TOOL_ERROR", severity: "INFO", source: "gateway", message: "Pilot: ambiguous query, no tool invoked" });
    return clarificationView(session.id, "Could you tell me a bit more about what you're looking for — a product name, category, or the surface/fabric you'd like to care for?");
  }

  async function runSearch(query: string) {
    const result = await invokeGatewayTool(
      "commerce.searchProducts",
      [{ query, pageSize: MAX_GROUNDED_PRODUCTS }, requestId],
      { isGuest: !session.customerId, identifier: session.id }
    );
    if (!result.success) {
      // Security denial (not enrolled/rolled out), rate limit, or an
      // unregistered-tool response — never fabricate a reply here, hand
      // the whole turn back to the proven legacy path instead.
      throw new PilotUnavailableError(`Pilot tool call was denied: ${result.error.code}`);
    }
    const data = result.data as { success: boolean; data?: { items: ProductSearchItem[] }; error?: { code: string } };
    if (!data.success) {
      throw new PilotUnavailableError(`Commerce Intelligence returned an error: ${data.error?.code ?? "UNKNOWN"}`);
    }
    return (data.data?.items ?? []).slice(0, MAX_GROUNDED_PRODUCTS).map(toGroundedProduct);
  }

  let products = await runSearch(intent.query);

  if (products.length === 0 && !usedCoreferenceFallback && lastCustomerMessage) {
    const combined = classifyPilotIntent(`${lastCustomerMessage} ${request.customerMessage}`);
    if (combined.kind === "PRODUCT_SEARCH" && combined.query !== intent.query) {
      await emitGatewayEvent({ requestId, eventType: "RETRY", severity: "INFO", source: "gateway", message: "Pilot: retrying search combined with the previous turn's message (coreference fallback)" });
      products = await runSearch(combined.query);
      if (products.length > 0) usedCoreferenceFallback = true;
    }
  }

  if (products.length === 0) {
    await emitGatewayEvent({ requestId, eventType: "COMMERCE_TOOL_USAGE", source: "commerce", message: "Pilot: real search found no verified match", metadata: { productCount: 0 } });
    return clarificationView(
      session.id,
      "I couldn't find a verified match for that in our current catalog — could you tell me the category (like Home Care or Fabric Care) or the surface/fabric you're caring for, so I can look again?"
    );
  }

  // Only the actual grounded-summarization branch needs a live provider —
  // the clarification/no-match replies above are fully deterministic and
  // must keep working even if the provider is temporarily misconfigured
  // OR the Stage 1 emergency provider kill switch is active.
  const adapter = getEffectiveProviderAdapter();
  if (!adapter || !adapter.isConfigured()) {
    throw new PilotUnavailableError("Pilot requires a configured Provider Adapter to summarize real search results; none is active.");
  }

  // Stage 6 — real multi-turn context: a bounded slice of this same
  // session's own prior turns, never a second/competing memory store.
  const contextWindow = buildContextWindow(session.memoryItems, { maxItems: 6, maxChars: 1500 });
  const conversationHistory = contextWindow.items.length > 0 ? contextWindow.items.map((item) => `- ${item.content}`).join("\n") : undefined;

  const { system, user } = buildGroundedPrompt(request.customerMessage, products, conversationHistory);

  const start = Date.now();
  let generation: GatewayGenerateOutput;
  try {
    generation = await adapter.generate({
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      // Deliberately no `temperature` — Anthropic rejects it as deprecated
      // for the current default model (discovered via a real staging call
      // during Phase 6.1 verification: 400 invalid_request_error). Fixed
      // here, in the pilot's own call, rather than in the frozen Provider
      // Adapter, which this phase must not modify.
      maxTokens: getGatewayProductionConfig().maxOutputTokens,
    });
  } catch (err) {
    await recordProviderOutcome(requestId, adapter.name, Date.now() - start, err);
    throw new PilotUnavailableError("Provider generation failed for the pilot turn.");
  }

  await emitGatewayEvent({
    requestId,
    eventType: "PROVIDER_LATENCY",
    source: "provider",
    durationMs: Date.now() - start,
    message: `${adapter.name} pilot generation completed`,
    metadata: { model: generation.model, finishReason: generation.finishReason ?? null },
  });

  if (generation.usage) {
    await recordTokenUsageEvent(requestId, {
      promptTokens: generation.usage.promptTokens ?? 0,
      completionTokens: generation.usage.completionTokens ?? 0,
      totalTokens: (generation.usage.promptTokens ?? 0) + (generation.usage.completionTokens ?? 0),
    });
  }

  const validation = validateGeneratedResponse(generation.text, products);
  if (!validation.valid) {
    logger.error("gateway:pilot-response-validation-failed", { requestId, reason: validation.reason });
    await emitGatewayEvent({
      requestId,
      eventType: "TOOL_ERROR",
      severity: "ERROR",
      source: "gateway",
      message: `Pilot: generated response failed post-generation validation (${validation.reason}) — falling back rather than returning it`,
      metadata: { reason: validation.reason },
    });
    // Same discipline as every other failure mode in this file: never
    // return unverified content, hand the turn back to the deterministic
    // legacy path instead.
    throw new PilotUnavailableError(`Pilot generation failed response validation: ${validation.reason}`);
  }

  await emitGatewayEvent({
    requestId,
    eventType: "COMMERCE_TOOL_USAGE",
    source: "commerce",
    message: "Pilot turn completed with grounded generation",
    metadata: { productCount: products.length, contextItemsUsed: contextWindow.items.length, contextTruncated: contextWindow.truncated, usedCoreferenceFallback },
  });

  // Defense-in-depth, same as the legacy path's adaptForWebsite(): even
  // past validateGeneratedResponse()'s hold-the-whole-turn gate above,
  // every individual segment is re-scanned and redacted-to-placeholder
  // rather than trusted outright — "the confidentiality scanner remains
  // final backstop" applies per segment, not just per turn.
  const segments: WebsiteExperienceSegment[] = [
    { kind: "MESSAGE", content: backstopScanSegmentContent(generation.text.trim(), "MESSAGE") },
    ...products.map((p): WebsiteExperienceSegment => ({
      kind: "REFERENCE_CARD",
      content: backstopScanSegmentContent(p.name, "REFERENCE_CARD"),
      meta: { referenceType: "PRODUCT", id: p.slug, priceRange: p.priceRange, inStock: p.inStock },
    })),
  ];

  return buildView(session.id, segments, "EXECUTED");
}
