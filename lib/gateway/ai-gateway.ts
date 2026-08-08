import { orchestrateExperience } from "@/lib/experience/experience-orchestrator";
import type { ExperienceRequest, WebsiteExperienceView } from "@/lib/experience/types";
import { getGatewayProviderAdapter, getGatewayProviderConfigStatus } from "@/lib/gateway/providers";
import type { GatewayProviderAdapter, GatewayProviderConfigStatus } from "@/lib/gateway/providers";
import * as KnowledgeApi from "@/lib/gateway/knowledge";
import * as CommerceApi from "@/lib/gateway/commerce";
import * as CustomerApi from "@/lib/gateway/customer";
import * as ConversationApi from "@/lib/gateway/conversation";
import { instrumentGatewayTurn, generateRequestId } from "@/lib/gateway/observability";
import * as SecurityApi from "@/lib/gateway/security";
import * as KnowledgeGovernanceApi from "@/lib/gateway/knowledge-governance";

/**
 * MUV AI Gateway (Phase 5.2, Module 1).
 *
 * This is the single backend entry point for every AI turn originating
 * from the storefront customer widget. `actions/experience.ts`'s
 * `orchestrateExperience` Server Action calls only this function — never
 * `lib/experience/experience-orchestrator.ts` directly, and never a
 * provider/tool/memory/logging module directly. That is the concrete
 * meaning of "the frontend must continue talking only to the MUV AI
 * Gateway, never directly to an LLM provider": the widget already only
 * ever called one Server Action, and that Server Action now only ever
 * calls one function, here.
 *
 * Module 1 is deliberately a pass-through: it delegates to the existing,
 * frozen Experience Orchestrator (Modules 5-8) with zero behavior change,
 * per the explicit "do not modify the existing AI experience" instruction.
 * Its job is to be the seam later Phase 5.2 modules attach to, without
 * ever requiring another change to this signature or to its one caller:
 *   - Module 2 (Provider Adapter) will add real LLM provider selection
 *     inside the pipeline this function fronts.
 *   - Module 3-6 (Knowledge/Commerce/Customer/Founder APIs) will add
 *     callable tool/data APIs the pipeline can invoke mid-turn.
 *   - Module 7 (Streaming) will add a second, streaming-capable entry
 *     point alongside this one.
 *   - Module 8 (Conversation memory) will extend session memory handling
 *     already inside the orchestrator this function calls.
 *   - Module 9 (Logging) and Module 10 (Security) will wrap this
 *     function's call boundary with audit logging and input/output
 *     security checks, without changing what it returns for a well-formed
 *     request.
 *
 * Phase 5.6 (Observability) wraps this call in `instrumentGatewayTurn` —
 * a pure side-effect (measures duration, emits one `GATEWAY_LATENCY` or
 * `TOOL_ERROR` event) that passes the real return value or thrown error
 * through completely unchanged. This is the literal mechanism behind
 * "preserve zero behaviour change in the live storefront turn path":
 * `orchestrateExperience(request)` is called exactly as before, with
 * exactly the same input, and its result is neither inspected nor
 * altered before being returned.
 */
export async function runAiGatewayTurn(request: ExperienceRequest): Promise<WebsiteExperienceView> {
  const requestId = generateRequestId();
  return instrumentGatewayTurn(requestId, () => orchestrateExperience(request));
}

/**
 * Module 2 (Provider Adapter) attachment point. `runAiGatewayTurn` above
 * does NOT call this yet — the Experience Orchestrator it delegates to is
 * still 100% deterministic, exactly as before, per "zero behaviour changes
 * until a real provider is enabled." This function exists so the Gateway
 * (not the widget, not the Server Action, not any provider file) is the
 * one place that knows how to obtain "the currently configured provider,
 * whatever it is" — the concrete meaning of "the frontend must never know
 * which provider is active" and "do not hardcode provider-specific logic
 * into the Gateway": this function contains no provider name, no branch,
 * no adapter class — that switch lives only in
 * `lib/gateway/providers/index.ts`. A future module (e.g. Streaming, or
 * whichever module the Founder designates to actually turn generation on)
 * calls this to get the adapter, rather than importing a provider file
 * directly.
 */
export function getGatewayProvider(): GatewayProviderAdapter | null {
  return getGatewayProviderAdapter();
}

/** Zero-network-call diagnostic — which provider is selected, whether it's
 * implemented, whether its credentials are present. Safe for a staff
 * diagnostics surface; never exposed to the storefront widget itself. */
export function getGatewayProviderStatus(): GatewayProviderConfigStatus {
  return getGatewayProviderConfigStatus();
}

/**
 * Module 3 (Knowledge API) attachment point. Same pattern as
 * `getGatewayProvider()` above: `runAiGatewayTurn` does NOT call this
 * yet, and never invokes the Provider Adapter from within it — Knowledge
 * retrieval and LLM generation are deliberately kept apart until a future
 * module explicitly wires knowledge-grounded generation into the turn
 * path. Re-exported here (not just importable from `lib/gateway/
 * knowledge` directly) so the Gateway is the one place anything looking
 * for "MUV's governed knowledge API" is documented to look, matching how
 * the Provider Adapter is discovered via `getGatewayProvider()` above.
 */
export const knowledgeApi = KnowledgeApi;

/**
 * Phase 5.3 (Commerce Intelligence) attachment point. Same pattern as
 * `knowledgeApi` above — available, tested, not called by
 * `runAiGatewayTurn`. Every function in `lib/gateway/commerce` already
 * enforces its own RBAC where relevant (wishlist/recently-viewed inherit
 * `requireCustomer()` from the Server Actions they wrap) and never
 * touches Prisma directly itself.
 */
export const commerceApi = CommerceApi;

/**
 * Phase 5.4 (Customer Intelligence) attachment point. Same pattern as
 * `commerceApi`/`knowledgeApi` above. Every function enforces RBAC
 * internally (`requireCustomer()`, ownership-checked) — a guest caller
 * gets a structured error, never authenticated data, from every function
 * in this module.
 */
export const customerApi = CustomerApi;

/**
 * Phase 5.5 (Conversation Runtime) attachment point. Same pattern as
 * every other module above. `lib/gateway/conversation/streaming.ts`
 * deliberately does NOT import `getGatewayProvider` from this file (that
 * would be circular, since this file imports the conversation module) —
 * it calls `lib/gateway/providers` directly, the same factory this
 * file's own `getGatewayProvider()` wraps.
 */
export const conversationApi = ConversationApi;

/**
 * Phase 5.7 (Security & Production Readiness) attachment point.
 * `securityApi.invokeGatewayTool(toolName, args, context)` is the
 * enforcement point for the centralized tool allow-list, per-tool
 * authorization, and rate limiting — not called by `runAiGatewayTurn`
 * (which never invokes Commerce/Customer/Conversation tools at all
 * today), but the correct calling convention for any future step that
 * does. `commerceApi`/`customerApi`/`conversationApi` above remain
 * directly importable for tests/tooling that need to call one function
 * without going through the dispatcher.
 */
export const securityApi = SecurityApi;

/**
 * Phase 6.1 (Knowledge Governance) attachment point. Tooling for
 * proposing/reviewing/approving a 6-tier (PUBLIC/CUSTOMER/PARTNER/
 * INTERNAL/FOUNDER/CONFIDENTIAL) classification per Knowledge Factory
 * domain — records decisions only. Approving a proposal here has no
 * effect on `knowledgeApi`'s actual retrieval behavior; applying an
 * approved classification to `lib/gateway/knowledge/authorization.ts`'s
 * real enforcement mapping is a distinct, separately authorized future
 * change, never automatic.
 */
export const knowledgeGovernanceApi = KnowledgeGovernanceApi;
