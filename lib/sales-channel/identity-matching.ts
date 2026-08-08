import type { Prisma, PrismaClient } from "@prisma/client";

type Db = Prisma.TransactionClient | PrismaClient;
type Candidate = { customerId?: string; userId?: string; email?: string; phone?: string; gstNumber?: string; businessName?: string };

export async function matchCustomer(db: Db, candidate: Candidate) {
  if (candidate.customerId) {
    const customer = await db.customer.findUnique({ where: { id: candidate.customerId } });
    if (customer) return { state: "EXACT" as const, customer };
  }
  if (candidate.userId) {
    const customer = await db.customer.findUnique({ where: { userId: candidate.userId } });
    if (customer) return { state: "EXACT" as const, customer };
  }
  if (candidate.email) {
    const customer = await db.customer.findUnique({ where: { email: candidate.email.toLowerCase() } });
    if (customer) return { state: "EXACT" as const, customer };
  }
  for (const where of [
    candidate.phone ? { phone: candidate.phone } : null,
    candidate.gstNumber ? { gstNumber: candidate.gstNumber } : null,
  ]) {
    if (!where) continue;
    const matches = await db.customer.findMany({ where, take: 2 });
    if (matches.length === 1) return { state: "EXACT" as const, customer: matches[0] };
    if (matches.length > 1) return { state: "POSSIBLE" as const, possibleCustomer: matches[0] };
  }
  if (candidate.businessName) {
    const matches = await db.customer.findMany({
      where: { businessName: { equals: candidate.businessName, mode: "insensitive" } }, take: 2,
    });
    if (matches.length) return { state: "POSSIBLE" as const, possibleCustomer: matches[0] };
  }
  return { state: "NONE" as const };
}
