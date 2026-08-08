import crypto from "node:crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import {
  AppError,
  ForbiddenError,
  NotFoundError,
} from "@/lib/errors";
import type { AiIntent, AiPrincipal } from "./types";

const transitions: Record<string, string[]> = {
  DRAFT: ["QUEUED", "CANCELLED"],
  QUEUED: ["RUNNING", "CANCELLED", "EXPIRED"],
  RUNNING: [
    "WAITING_FOR_TOOL",
    "WAITING_FOR_APPROVAL",
    "PAUSED",
    "COMPLETED",
    "PARTIALLY_COMPLETED",
    "FAILED",
    "CANCELLED",
  ],
  WAITING_FOR_TOOL: ["RUNNING", "FAILED", "CANCELLED"],
  WAITING_FOR_APPROVAL: ["RUNNING", "FAILED", "CANCELLED", "EXPIRED"],
  PAUSED: ["RUNNING", "CANCELLED", "EXPIRED"],
  FAILED: ["QUEUED", "CANCELLED"],
};

export async function transitionWorkflow(
  principal: AiPrincipal,
  workflowId: string,
  target: string,
  reason?: string,
) {
  return prisma.$transaction(async tx => {
    const workflow = await tx.aiWorkflow.findFirst({
      where: {
        id: workflowId,
        organizationKey: principal.organizationKey,
      },
    });

    if (!workflow) throw new NotFoundError("AI workflow");

    if (
      workflow.requestedById !== principal.id &&
      !principal.isFounder &&
      !principal.permissions.has("ai.workflows.monitor")
    ) {
      throw new ForbiddenError();
    }

    if (!transitions[workflow.status]?.includes(target)) {
      throw new AppError("Illegal workflow transition", 409);
    }

    const updated = await tx.aiWorkflow.update({
      where: { id: workflow.id },
      data: {
        status: target,
        startedAt:
          target === "RUNNING" && !workflow.startedAt
            ? new Date()
            : undefined,
        completedAt: ["COMPLETED", "PARTIALLY_COMPLETED"].includes(target)
          ? new Date()
          : undefined,
        cancelledAt: target === "CANCELLED" ? new Date() : undefined,
        failureReason: target === "FAILED" ? reason : undefined,
      },
    });

    await tx.salesAuditLog.create({
      data: {
        userId: principal.id,
        module: "muv_ai_workflow",
        action: `WORKFLOW_${target}`,
        recordType: "AiWorkflow",
        recordId: workflow.id,
        previousValue: { status: workflow.status },
        newValue: { status: target, reason },
      },
    });

    return updated;
  });
}

export async function checkpoint(
  workflowId: string,
  stepNumber: number,
  state: Prisma.InputJsonValue,
) {
  const stateHash = crypto
    .createHash("sha256")
    .update(JSON.stringify(state))
    .digest("hex");

  return prisma.aiWorkflowCheckpoint.create({
    data: { workflowId, stepNumber, state, stateHash },
  });
}

export async function createActionRequest(
  principal: AiPrincipal,
  input: {
    conversationId: string;
    workflowId: string;
    agentCode: string;
    actionType: string;
    targetEntity: string;
    targetRecordId?: string;
    targetVersion?: string;
    payload: Prisma.InputJsonValue;
    preview: Prisma.InputJsonValue;
    idempotencyKey: string;
  },
) {
  const config = await prisma.aiConfiguration.findUnique({
    where: {
      organizationKey_key: {
        organizationKey: principal.organizationKey,
        key: "AI_ACTION_EXECUTION",
      },
    },
  });

  const risk = /PAYMENT|INVOICE|REWARD|MEMBERSHIP|MERGE|PERMISSION|DELETE|CONFIGURATION|PROVIDER|PROMPT/i.test(
    input.actionType,
  )
    ? "HIGH"
    : /ASSIGN|QUOTATION|BULK/i.test(input.actionType)
      ? "MEDIUM"
      : "LOW";

  const approvalRequired = risk !== "LOW";

  return prisma.$transaction(async tx => {
    const action = await tx.aiActionRequest.create({
      data: {
        organizationKey: principal.organizationKey,
        conversationId: input.conversationId,
        workflowId: input.workflowId,
        requestedById: principal.id,
        proposedByAgent: input.agentCode,
        actionType: input.actionType,
        targetEntity: input.targetEntity,
        targetRecordId: input.targetRecordId,
        targetVersion: input.targetVersion,
        inputPayload: input.payload,
        previewPayload: input.preview,
        riskLevel: risk,
        approvalPolicy: {
          required: approvalRequired,
          executionEnabled:
            (config?.value as { enabled?: boolean })?.enabled === true,
        },
        status: approvalRequired
          ? "PENDING_APPROVAL"
          : "PENDING_VALIDATION",
        idempotencyKey: input.idempotencyKey,
      },
    });

    await tx.salesAuditLog.create({
      data: {
        userId: principal.id,
        module: "muv_ai_action",
        action: "ACTION_PROPOSED",
        recordType: "AiActionRequest",
        recordId: action.id,
        newValue: { actionType: input.actionType, risk, approvalRequired },
      },
    });

    if (approvalRequired) {
      await tx.notificationLog.create({
        data: {
          channel: "DASHBOARD",
          type: "AI_APPROVAL_REQUIRED",
          recipient: principal.email ?? principal.id,
          status: "PENDING",
        },
      });
    }

    return action;
  });
}

export async function decideAction(
  principal: AiPrincipal,
  actionId: string,
  decision: "APPROVED" | "REJECTED",
  reason: string,
) {
  if (
    !principal.isFounder &&
    !principal.permissions.has("ai.actions.approve")
  ) {
    throw new ForbiddenError();
  }

  if (!reason.trim()) {
    throw new AppError("Approval reason is required");
  }

  return prisma.$transaction(async tx => {
    const action = await tx.aiActionRequest.findFirst({
      where: {
        id: actionId,
        organizationKey: principal.organizationKey,
        status: "PENDING_APPROVAL",
      },
    });

    if (!action) throw new NotFoundError("Pending AI action");

    if (action.expiresAt && action.expiresAt < new Date()) {
      throw new AppError("Approval has expired", 409);
    }

    if (
      action.requestedById === principal.id &&
      action.riskLevel === "HIGH" &&
      !principal.isFounder
    ) {
      throw new ForbiddenError("High-risk self-approval is prohibited");
    }

    await tx.aiApprovalDecision.create({
      data: {
        actionRequestId: action.id,
        actorId: principal.id,
        decision,
        reason,
        policyVersion: 1,
      },
    });

    const updated = await tx.aiActionRequest.update({
      where: { id: action.id },
      data: {
        status: decision,
        approvedAt: decision === "APPROVED" ? new Date() : undefined,
        rejectedAt: decision === "REJECTED" ? new Date() : undefined,
      },
    });

    await tx.salesAuditLog.create({
      data: {
        userId: principal.id,
        module: "muv_ai_action",
        action: `ACTION_${decision}`,
        recordType: "AiActionRequest",
        recordId: action.id,
        newValue: { reason },
      },
    });

    return updated;
  });
}

export function workflowForIntent(intent: AiIntent) {
  if (intent === "EXECUTE_ACTION") return "APPROVAL_ACTION";
  if (intent === "RECOMMEND") return "EVIDENCE_RECOMMENDATION";
  if (["GENERATE", "SUMMARIZE"].includes(intent)) return "EXECUTIVE_BRIEFING";
  return "READ_ONLY_ASSISTANCE";
}