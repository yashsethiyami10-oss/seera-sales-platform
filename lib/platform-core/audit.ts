import { headers } from "next/headers";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

type AuditEvent = {
  userId?: string | null; module: string; action: string;
  recordType?: string; recordId?: string;
  previousValue?: unknown; newValue?: unknown;
};

/**
 * Milestone 4.1 — optional `client` param (defaults to the regular `prisma`
 * singleton, exactly matching every existing caller's behavior unchanged)
 * lets a caller pass a `Prisma.TransactionClient` so this audit write
 * becomes part of the caller's own atomic transaction instead of committing
 * independently. Needed for actions/inst-quotations.ts's acceptQuotation,
 * which must not leave an audit row behind if the surrounding transaction
 * rolls back. Every other existing caller is untouched — they never pass a
 * second argument, so they keep writing via the plain `prisma` client.
 */
export async function appendAuditLog(event: AuditEvent, client: Prisma.TransactionClient | typeof prisma = prisma) {
  const requestHeaders = await headers();
  return client.salesAuditLog.create({
    data: {
      ...event,
      previousValue: event.previousValue as object | undefined,
      newValue: event.newValue as object | undefined,
      ipAddress: requestHeaders.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null,
      userAgent: requestHeaders.get("user-agent"),
    },
  });
}
