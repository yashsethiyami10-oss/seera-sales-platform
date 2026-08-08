/**
 * Milestone 9 — Customer Support. Shared domain vocabulary, matching every
 * other Enterprise v3 domain module's "plain, fixed, documented constant"
 * convention (lib/enterprise-finance/domain.ts, lib/founder-os/domain.ts).
 */

import type { SupportTicketStatus } from "@prisma/client";

/** Default governed transition map — the approved architecture's lifecycle.
 * A department can override with its own SupportEscalationRule-style config
 * later; this fixed map is Milestone 9's real, enforced default. */
export const TICKET_STATUS_TRANSITIONS: Record<SupportTicketStatus, SupportTicketStatus[]> = {
  NEW: ["ASSIGNED", "CLOSED"],
  ASSIGNED: ["IN_PROGRESS", "WAITING_ON_CUSTOMER", "WAITING_ON_INTERNAL", "CLOSED"],
  IN_PROGRESS: ["WAITING_ON_CUSTOMER", "WAITING_ON_INTERNAL", "RESOLVED", "CLOSED"],
  WAITING_ON_CUSTOMER: ["IN_PROGRESS", "RESOLVED", "CLOSED"],
  WAITING_ON_INTERNAL: ["IN_PROGRESS", "RESOLVED", "CLOSED"],
  RESOLVED: ["CLOSED", "REOPENED"],
  CLOSED: ["REOPENED"],
  REOPENED: ["ASSIGNED"],
};

/** Default escalation chain — Agent -> Senior Agent -> Support Manager ->
 * Department Head -> Founder (optional cap). Level 1 fires immediately on
 * SLA breach; each subsequent level fires afterMinutes past that. */
export const DEFAULT_ESCALATION_CHAIN = [
  { level: 1, roleName: "Senior Support Agent", afterMinutes: 0 },
  { level: 2, roleName: "Support Manager", afterMinutes: 60 },
  { level: 3, roleName: "Department Head", afterMinutes: 240 },
  { level: 4, roleName: "Founder", afterMinutes: 1440 },
] as const;

export const CRITICAL_PRIORITIES = ["URGENT", "CRITICAL"] as const;
