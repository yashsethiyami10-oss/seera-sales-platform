"use server";

import { z } from "zod";
import { headers } from "next/headers";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { toErrorResponse, AppError } from "@/lib/errors";
import { checkRateLimit } from "@/lib/rate-limit";

const logSchema = z.object({ term: z.string().min(2).max(80), resultCount: z.number().int().min(0) });

/** Logged for both guests and logged-in customers (customerId nullable) —
 * "Popular Searches" is a real cross-shopper aggregate, so it must include
 * guest searches too, not just the minority who are logged in. Fire-and-
 * forget from the client; a failure here never blocks the search itself.
 * Rate-limited by IP (Phase 16) — this is called on every debounced
 * keystroke pause from an unauthenticated-safe client component, so it's a
 * plausible log-spam/DB-write-spam target without a throttle. */
export async function logSearch(input: unknown) {
  try {
    const headersList = await headers();
    const ip = headersList.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
    const { allowed } = checkRateLimit(`log-search:${ip}`, 30, 60 * 1000);
    if (!allowed) throw new AppError("Too many requests", 429, "RATE_LIMITED");

    const data = logSchema.parse(input);
    const session = await auth();
    let customerId: string | undefined;
    if (session?.user) {
      const customer = await prisma.customer.findUnique({ where: { userId: session.user.id }, select: { id: true } });
      customerId = customer?.id;
    }
    await prisma.searchQuery.create({ data: { term: data.term.trim().toLowerCase(), resultCount: data.resultCount, customerId } });
    return { success: true as const, data: null };
  } catch (err) {
    return toErrorResponse(err);
  }
}

/** Real aggregate over actual logged searches — only the term and its count
 * are ever returned, never who searched it. */
export async function getPopularSearches(limit = 6) {
  const rows = await prisma.searchQuery.groupBy({
    by: ["term"],
    _count: { term: true },
    orderBy: { _count: { term: "desc" } },
    take: limit,
  });
  return rows.map((r) => ({ term: r.term, count: r._count.term }));
}
