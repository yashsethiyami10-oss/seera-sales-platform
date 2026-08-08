import { prisma } from "@/lib/prisma";

/**
 * "Customer Conversations" / "Customer AI Memory" — a customer reading
 * their OWN past AI session history and accumulated memory. Reuses the
 * existing, frozen `ExperienceSession` model (Module 8's real session/
 * memory persistence) directly rather than adding a new table or
 * touching `lib/experience/session-manager.ts` (that file's own
 * create/get/touch/close functions are for the live turn path; this is a
 * new, separate, read-only, customer-scoped view over the same data, not
 * a modification of that file or its behavior).
 *
 * This is the one deliberate exception to "the Gateway layer never
 * touches Prisma directly" in this Wave: no existing function anywhere
 * lists a customer's sessions or reads one session's memory scoped by
 * owner, and `session-manager.ts`'s own `getSession(sessionId)` takes
 * only a session id (no ownership check, since its caller — the
 * Experience Orchestrator — already trusts the session id it generated).
 * Both functions here explicitly re-check `customerId` ownership
 * themselves, never trusting a caller-supplied match.
 *
 * "Do NOT expose chain-of-thought. Persist only approved metadata." —
 * `MemoryItem.content` is, by construction, always the customer's own
 * `customerMessage` text (see `experience-orchestrator.ts`'s
 * `orchestrateExperience`) — never internal reasoning, a decision trace,
 * or anything Module 6/7 computed. Returning it to the same customer who
 * said it exposes nothing they didn't already provide.
 */

export async function listCustomerConversations(customerId: string, limit = 10) {
  return prisma.experienceSession.findMany({
    where: { customerId },
    orderBy: { lastActivityAt: "desc" },
    take: Math.max(1, Math.min(limit, 50)),
    select: { id: true, channel: true, status: true, createdAt: true, lastActivityAt: true, expiresAt: true },
  });
}

export async function getCustomerConversationMemory(customerId: string, sessionId: string) {
  const session = await prisma.experienceSession.findUnique({
    where: { id: sessionId },
    select: { id: true, customerId: true, status: true, memoryItems: true, lastActivityAt: true },
  });
  if (!session || session.customerId !== customerId) return null;
  return { sessionId: session.id, status: session.status, memoryItems: session.memoryItems, lastActivityAt: session.lastActivityAt };
}
