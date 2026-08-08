import crypto from "node:crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { AppError, ForbiddenError, NotFoundError } from "@/lib/errors";
import { assemblePrompt } from "./prompt";
import { invokeModel } from "./gateway";
import { invokeTool } from "./tools";
import { checkpoint, workflowForIntent } from "./workflow";
import {
  correlationId,
  enforceAiPlatform,
  rateLimit,
  sanitizeContext,
} from "./security";
import { runEiosRuntime } from "@/lib/eios/runtime";
import type { AiIntent, AiPrincipal, GovernedResponse } from "./types";

export function classifyIntent(text: string): AiIntent {
  const value = text.trim().toLowerCase();

  if (!value) return "UNKNOWN";
  if (/^(find|search|show|lookup)\b/.test(value)) return "SEARCH";
  if (/\b(compare|versus|vs\.?)\b/.test(value)) return "COMPARE";
  if (/\b(calculate|total|average|rate)\b/.test(value)) return "CALCULATE";
  if (/\b(summarize|summary|briefing)\b/.test(value)) return "SUMMARIZE";
  if (/^(why|explain)\b/.test(value)) return "EXPLAIN";

  // Care/shopping recommendation language, including natural gift requests.
  if (
    /\b(recommend|suggest|gift|present|surprise|birthday|bday|anniversary|what should i buy|what can i give)\b/.test(
      value,
    )
  ) {
    return "RECOMMEND";
  }

  if (/\b(create|assign|schedule|execute|update|delete|adjust)\b/.test(value)) {
    return "EXECUTE_ACTION";
  }

  if (/\b(configure|configuration|setting)\b/.test(value)) {
    return "CONFIGURATION";
  }

  if (/\b(help|how do i)\b/.test(value)) return "HELP";
  if (value.includes("?") || /^(what|who|when|where|how|can|could|would|should|is|are|do|does)\b/.test(value)) {
    return "QUESTION";
  }

  // Natural conversational text should not fall into a clarification loop.
  return "QUESTION";
}

async function routeAgent(
  principal: AiPrincipal,
  intent: AiIntent,
  module?: string,
) {
  const preferred =
    (principal.isFounder &&
      ["SUMMARIZE", "COMPARE", "CALCULATE", "QUESTION"].includes(intent)) ||
    module === "founder"
      ? "FOUNDER_INTELLIGENCE"
      : module === "commerce"
        ? "COMMERCE_INTELLIGENCE"
        : module === "customer" || module === "support"
          ? "CUSTOMER_INTELLIGENCE"
          : intent === "SEARCH"
            ? "KNOWLEDGE"
            : intent === "RECOMMEND"
              ? "CUSTOMER_INTELLIGENCE"
              : principal.roleName === "Customer Support"
                ? "CUSTOMER_INTELLIGENCE"
                : "SALES_INTELLIGENCE";

  const agent = await prisma.aiAgentDefinition.findUnique({
    where: { code: preferred },
  });

  if (!agent || agent.status !== "ACTIVE") {
    throw new AppError("No authorized AI agent is available", 503);
  }

  if (
    agent.allowedRoles.length &&
    !agent.allowedRoles.includes(principal.roleName) &&
    !principal.isFounder
  ) {
    throw new ForbiddenError("Agent routing denied");
  }

  if (
    !principal.isFounder &&
    agent.requiredPermissions.some(
      permission => !principal.permissions.has(permission),
    )
  ) {
    throw new ForbiddenError("Agent permission denied");
  }

  return agent;
}

// Sprint 13 (Sales AI) — the "sales" module has more than one tool, unlike
// "support"'s two, so this is a small named function rather than another
// ternary link: EXECUTE_ACTION only ever calls a write tool when the
// caller's actionPayload explicitly names which one via `actionKind`
// (never guessed from free text); everything else is a lookup, defaulting
// to opportunities unless `lookupKind` names a more specific one.
function selectSalesToolCode(intent: AiIntent, actionPayload?: Record<string, unknown>): string {
  if (intent === "EXECUTE_ACTION" && actionPayload) {
    if (actionPayload.actionKind === "FOLLOWUP") return "CREATE_FOLLOWUP";
    if (actionPayload.actionKind === "QUOTATION") return "CREATE_DRAFT_QUOTATION";
  }
  if (actionPayload?.lookupKind === "SALES_INTELLIGENCE") return "SALES_INTELLIGENCE_LOOKUP";
  if (actionPayload?.lookupKind === "REPORT") return "REPORT_LOOKUP";
  return "OPPORTUNITY_LOOKUP";
}

// Sprint 14 (Founder AI) — read-only lookups only; the Founder module has
// no write tool at all today (Founder OS's own mutating actions —
// acknowledgeAlert/resolveAlert/etc — are deliberately not wired here,
// matching this sprint's own disclosed scope of "lookup tools first").
function selectFounderToolCode(actionPayload?: Record<string, unknown>): string {
  if (actionPayload?.lookupKind === "DECISION_QUEUE") return "FOUNDER_DECISION_QUEUE_LOOKUP";
  if (actionPayload?.lookupKind === "AI_PLATFORM_HEALTH") return "AI_PLATFORM_HEALTH_LOOKUP";
  if (actionPayload?.lookupKind === "REPORT") return "REPORT_LOOKUP";
  return "FOUNDER_DASHBOARD_LOOKUP";
}

function requiresAuthoritativeEvidence(intent: AiIntent, module?: string) {
  if (module === "customer" || module === "commerce") return true;

  return [
    "SEARCH",
    "COMPARE",
    "CALCULATE",
    "SUMMARIZE",
    "EXPLAIN",
    "EXECUTE_ACTION",
    "CONFIGURATION",
  ].includes(intent);
}

export async function submitGovernedMessage(
  principal: AiPrincipal,
  conversationId: string,
  text: string,
  // actionPayload (Sprint 12) — structured, caller-supplied fields for a
  // write tool (e.g. CREATE_SUPPORT_TICKET's channel/category/subject/
  // customerId/departmentId). Never derived from free-text `text` by
  // guessing — "never fabricate" extends to never inferring structured
  // required fields from a chat message; a write tool call without this
  // populated correctly fails its own Zod validation loudly, not silently.
  options: { module?: string; selectedRecordIds?: string[]; actionPayload?: Record<string, unknown> } = {},
): Promise<GovernedResponse> {
  const trace = correlationId();
  const started = Date.now();

  await enforceAiPlatform(principal, text);
  await rateLimit(principal);

  const conversation = await prisma.aiConversation.findFirst({
    where: {
      id: conversationId,
      organizationKey: principal.organizationKey,
      deletedAt: null,
    },
  });

  if (!conversation) throw new NotFoundError("AI conversation");

  if (
    conversation.ownerId !== principal.id &&
    !conversation.participants.includes(principal.id) &&
    !principal.isFounder &&
    !principal.permissions.has("ai.conversations.manage")
  ) {
    throw new ForbiddenError("Conversation access denied");
  }

  const intent = classifyIntent(text);
  const agent = await routeAgent(principal, intent, options.module);

  const definition = await prisma.aiWorkflowDefinition.findUniqueOrThrow({
    where: { code: workflowForIntent(intent) },
  });

  const workflow = await prisma.$transaction(async tx => {
    await tx.aiMessage.create({
      data: {
        conversationId,
        senderId: principal.id,
        role: "USER",
        content: text,
        correlationId: trace,
        validationStatus: "VALIDATED",
      },
    });

    const row = await tx.aiWorkflow.create({
      data: {
        organizationKey: principal.organizationKey,
        conversationId,
        requestedById: principal.id,
        definitionId: definition.id,
        workflowType: definition.purpose,
        intent,
        status: "RUNNING",
        totalSteps: 6,
        maximumRetries: Number(
          (definition.retryPolicy as { maximumRetries?: number })
            .maximumRetries ?? 2,
        ),
        contextVersion: conversation.contextVersion,
        referencedRecords: options.selectedRecordIds ?? [],
        idempotencyKey: crypto
          .createHash("sha256")
          .update(`${conversationId}:${principal.id}:${text}`)
          .digest("hex"),
        correlationId: trace,
        startedAt: new Date(),
      },
    });

    await tx.aiWorkflowStep.createMany({
      data: [
        "INTENT_VALIDATION",
        "CONTEXT_BUILD",
        "KNOWLEDGE_RETRIEVAL",
        "TOOL_EXECUTION",
        "RESPONSE_VALIDATION",
        "RESPONSE_COMPOSITION",
      ].map((stepType, index) => ({
        workflowId: row.id,
        stepNumber: index + 1,
        stepType,
        assignedAgentCode: agent.code,
        status: index < 2 ? "COMPLETED" : "PENDING",
        input: index === 0 ? { intent } : {},
      })),
    });

    await tx.salesAuditLog.create({
      data: {
        userId: principal.id,
        module: "muv_ai",
        action: "WORKFLOW_STARTED",
        recordType: "AiWorkflow",
        recordId: row.id,
        newValue: { agent: agent.code, intent, correlationId: trace },
      },
    });

    return row;
  });

  const toolCode =
    options.module === "customer"
      ? "CUSTOMER_INTELLIGENCE"
      // Sprint 12 (Support AI) — EXECUTE_ACTION in the support module means
      // "open a ticket," matching classifyIntent's own create/assign/
      // schedule/execute/update/delete/adjust keyword list — but only when
      // the caller actually supplied the structured actionPayload a ticket
      // needs; without it, this falls back to a lookup rather than
      // attempting a create tool call that Zod would only reject anyway.
      : options.module === "support"
        ? intent === "EXECUTE_ACTION" && options.actionPayload ? "CREATE_SUPPORT_TICKET" : "SUPPORT_TICKET_LOOKUP"
        : options.module === "sales"
          ? selectSalesToolCode(intent, options.actionPayload)
          : options.module === "founder"
            ? selectFounderToolCode(options.actionPayload)
            : intent === "SEARCH"
              ? "KNOWLEDGE_SEARCH"
              : "CUSTOMER_LOOKUP";

  const WRITE_TOOL_CODES = new Set(["CREATE_SUPPORT_TICKET", "CREATE_FOLLOWUP", "CREATE_DRAFT_QUOTATION"]);
  const toolResult = await invokeTool(
    principal,
    toolCode,
    WRITE_TOOL_CODES.has(toolCode) && options.actionPayload
      ? options.actionPayload
      : { query: text, selectedRecordIds: options.selectedRecordIds ?? [], ...options.actionPayload },
    workflow.id,
    trace,
  );

  const prompt = await assemblePrompt(principal, "SYSTEM_GOVERNANCE", {
    user_request: text,
  });

  const model = await invokeModel({
    principal,
    conversationId,
    workflowId: workflow.id,
    prompt,
    correlationId: trace,
    evidence: toolResult.references,
  });

  // EIOS Runtime (Sprint 9) — runs Module 6's real Confidence/CQ engines
  // (via buildIntelligence) and layers the Self-Verification Gate,
  // Cognitive State selection, and Personality composition on top. The
  // gate's BLOCK decision can only make release *more* strict — it is
  // combined with the pre-existing evidence check below via AND, never
  // used to bypass it.
  const eios = await runEiosRuntime(
    { retrieval: { keywords: text }, customerMessage: text },
    { name: agent.name, purpose: agent.purpose, personalityProfile: agent.personalityProfile },
    false
  );

  const evidenceRequired = requiresAuthoritativeEvidence(intent, options.module);
  const valid =
    (!evidenceRequired ||
      toolResult.references.length > 0 ||
      ["HELP", "CONFIGURATION"].includes(intent)) &&
    eios.gate.decision !== "BLOCK";

  const responseType =
    toolResult.references.some(reference => reference.type === "KNOWLEDGE")
      ? "ORGANIZATIONAL_KNOWLEDGE"
      : evidenceRequired
        ? "VERIFIED_PLATFORM_DATA"
        : "GENERAL_AI_KNOWLEDGE";

  const CONFIDENCE_LEVEL_MAP = { HIGH: "HIGH", MODERATE: "MEDIUM", LOW: "LOW" } as const;
  const blockedByGate = eios.gate.decision === "BLOCK";
  const escalationWarning = eios.gate.escalationRecommended ? [`EIOS recommends human follow-up: ${eios.gate.reason}`] : [];

  const response: GovernedResponse = {
    status: valid ? "COMPLETED" : "BLOCKED",
    responseType,
    content: valid
      ? model.result.summary
      : blockedByGate
        ? "I don't have enough verified information to answer this confidently, so I did not generate an unverified answer."
        : "I could not find authorized evidence for this factual request, so I did not generate an unverified answer.",
    evidence: toolResult.references,
    confidence: valid ? CONFIDENCE_LEVEL_MAP[eios.gate.confidenceLevel] : "LOW",
    warnings: valid
      ? [...toolResult.warnings, ...escalationWarning]
      : ["Response withheld because evidence validation failed."],
    suggestedNextActions: [],
    correlationId: trace,
    cognitiveState: eios.cognitiveState,
    personalityDirective: eios.personality.directive,
  };

  await prisma.$transaction(async tx => {
    await tx.aiValidationResult.create({
      data: {
        organizationKey: principal.organizationKey,
        conversationId,
        workflowId: workflow.id,
        invocationId: model.invocationId,
        validationType: "RESPONSE_RELEASE",
        status: valid ? "PASSED" : "REJECTED",
        rules: {
          evidenceRequired,
          organizationScope: true,
          toolResultRequired: evidenceRequired,
          eiosGateDecision: eios.gate.decision,
          eiosCognitiveState: eios.cognitiveState,
          eiosConfidenceScore: eios.gate.confidenceScore,
        },
        evidence: toolResult.references,
        warnings: response.warnings,
      },
    });

    await tx.aiMessage.create({
      data: {
        conversationId,
        role: "ASSISTANT",
        content: response.content,
        references: toolResult.references,
        workflowId: workflow.id,
        responseMetadata: sanitizeContext(response) as Prisma.InputJsonValue,
        modelMetadata: {
          provider: model.providerCode,
          model: model.modelCode,
        },
        validationStatus: valid ? "VALIDATED" : "REJECTED",
        correlationId: trace,
      },
    });

    await tx.aiWorkflow.update({
      where: { id: workflow.id },
      data: {
        status: valid ? "COMPLETED" : "FAILED",
        currentStep: 6,
        completedAt: valid ? new Date() : undefined,
        failureReason: valid ? undefined : "Evidence validation failed",
      },
    });

    await tx.aiConversation.update({
      where: { id: conversation.id },
      data: { lastActivityAt: new Date() },
    });

    await tx.aiTelemetry.create({
      data: {
        organizationKey: principal.organizationKey,
        userId: principal.id,
        roleName: principal.roleName,
        conversationId,
        workflowId: workflow.id,
        agentCode: agent.code,
        providerCode: model.providerCode,
        modelCode: model.modelCode,
        metricType: "REQUEST",
        value: 1,
        unit: "count",
        correlationId: trace,
        metadata: {
          durationMs: Date.now() - started,
          validated: valid,
          evidenceRequired,
        },
      },
    });

    await tx.notificationLog.create({
      data: {
        channel: "DASHBOARD",
        type: valid ? "AI_WORKFLOW_COMPLETED" : "AI_WORKFLOW_FAILED",
        recipient: principal.email ?? principal.id,
        status: "PENDING",
      },
    });
  });

  await checkpoint(workflow.id, 6, {
    status: response.status,
    evidenceIds: response.evidence.map(item => item.id),
    validation: valid,
  });

  return response;
}