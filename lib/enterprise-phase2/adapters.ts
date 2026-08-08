import { ForbiddenError } from "@/lib/errors";
import type { EnterprisePrincipal, EnterpriseTx } from "@/lib/enterprise/context";
import {
  PHASE2_NOTIFICATION_EVENTS,
  PHASE2_WORKFLOW_SUBJECTS,
  recordPhase2Evidence,
} from "./foundation";

export function assertWorkflowSubject(subject: string) {
  if (!(PHASE2_WORKFLOW_SUBJECTS as readonly string[]).includes(subject)) {
    throw new ForbiddenError("Unsupported Phase 2 workflow subject");
  }
}

export function assertNotificationEvent(event: string) {
  if (!(PHASE2_NOTIFICATION_EVENTS as readonly string[]).includes(event)) {
    throw new ForbiddenError("Unsupported Phase 2 notification event");
  }
}

export async function recordWorkflowTransition(
  tx: EnterpriseTx,
  principal: EnterprisePrincipal,
  input: {
    subject: string;
    entityId: string;
    action: string;
    description: string;
    previous?: object;
    next?: object;
  },
) {
  assertWorkflowSubject(input.subject);
  return recordPhase2Evidence(tx, principal, {
    module: "ENTERPRISE_PHASE2_WORKFLOW",
    action: input.action,
    entityType: input.subject,
    entityId: input.entityId,
    description: input.description,
    previous: input.previous,
    next: input.next,
  });
}

export async function recordApprovalDecision(
  tx: EnterpriseTx,
  principal: EnterprisePrincipal,
  input: {
    subject: string;
    entityId: string;
    decision: "APPROVED" | "REJECTED";
    reason: string;
  },
) {
  assertWorkflowSubject(input.subject);
  if (!input.reason.trim()) throw new ForbiddenError("Approval reason is required");
  return recordPhase2Evidence(tx, principal, {
    module: "ENTERPRISE_PHASE2_APPROVAL",
    action: input.decision,
    entityType: input.subject,
    entityId: input.entityId,
    description: input.reason,
    next: { decision: input.decision },
  });
}
