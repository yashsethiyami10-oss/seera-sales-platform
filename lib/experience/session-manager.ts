import { prisma } from "@/lib/prisma";
import { NotFoundError } from "@/lib/errors";
import type { ExperienceSessionRecord, MemoryItem } from "./types";

/**
 * MUV AI — Experience Platform (Module 8) Session Manager.
 *
 * "Conversation session management." Real persistence — the one Module 6's
 * Memory Resolver explicitly deferred ("a future Module 7/8 owns real
 * memory persistence" — see `lib/intelligence/memory-resolver.ts`). A
 * session is identified by its `id`, which the caller (a future website
 * chat widget) holds and resends each turn — the same "client holds the
 * token, server validates it" shape already used for guest checkout
 * (`actions/orders.ts`), just applied to a conversation instead of a cart.
 *
 * Sessions expire lazily on read, not via a background job — no cron
 * infrastructure exists in this project, and a lazy check is sufficient
 * for a session record nothing else depends on staying fresh in real time.
 */

const SESSION_INACTIVITY_TTL_MS = 30 * 60 * 1000; // 30 minutes

function toRecord(row: {
  id: string;
  channel: string;
  customerId: string | null;
  status: string;
  memoryItems: unknown;
  createdAt: Date;
  updatedAt: Date;
  lastActivityAt: Date;
  expiresAt: Date | null;
}): ExperienceSessionRecord {
  return {
    id: row.id,
    channel: row.channel,
    customerId: row.customerId,
    status: row.status as ExperienceSessionRecord["status"],
    memoryItems: Array.isArray(row.memoryItems) ? (row.memoryItems as MemoryItem[]) : [],
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    lastActivityAt: row.lastActivityAt.toISOString(),
    expiresAt: row.expiresAt ? row.expiresAt.toISOString() : null,
  };
}

export async function createSession(channel: string, customerId: string | null): Promise<ExperienceSessionRecord> {
  const row = await prisma.experienceSession.create({
    data: { channel, customerId },
  });
  return toRecord(row);
}

/** Resolves a session, applying lazy expiry: an ACTIVE session whose last
 * activity is older than the inactivity TTL is marked EXPIRED before being
 * returned, rather than silently treated as still active. */
export async function getSession(sessionId: string): Promise<ExperienceSessionRecord> {
  const row = await prisma.experienceSession.findUnique({ where: { id: sessionId } });
  if (!row) throw new NotFoundError("Session");

  if (row.status === "ACTIVE" && Date.now() - row.lastActivityAt.getTime() > SESSION_INACTIVITY_TTL_MS) {
    const expired = await prisma.experienceSession.update({
      where: { id: sessionId },
      data: { status: "EXPIRED" },
    });
    return toRecord(expired);
  }

  return toRecord(row);
}

/** Called once per turn by the orchestrator to persist the accumulated
 * conversation memory and bump activity — never called for a session that
 * isn't ACTIVE (the orchestrator checks status first). */
export async function touchSession(sessionId: string, memoryItems: MemoryItem[]): Promise<ExperienceSessionRecord> {
  const row = await prisma.experienceSession.update({
    where: { id: sessionId },
    data: { memoryItems: memoryItems as object[], lastActivityAt: new Date() },
  });
  return toRecord(row);
}

export async function closeSession(sessionId: string): Promise<ExperienceSessionRecord> {
  const row = await prisma.experienceSession.update({
    where: { id: sessionId },
    data: { status: "CLOSED" },
  });
  return toRecord(row);
}
