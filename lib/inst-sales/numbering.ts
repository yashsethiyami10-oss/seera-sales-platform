import { Prisma } from "@prisma/client";

/**
 * Mirrors actions/customers.ts's generateCustomerCode/withCustomerCodeRetry
 * pattern — a random, human-readable, retry-on-conflict number rather than a
 * DB sequence (Prisma has no cross-database-portable sequence primitive, and
 * that existing precedent already proves this approach out for this app).
 */
function randomNumber(prefix: string) {
  return `${prefix}-${Math.floor(100000 + Math.random() * 900000)}`;
}

export async function withRetryOnNumberConflict<T>(prefix: string, attempt: (number: string) => Promise<T>): Promise<T> {
  for (let i = 0; i < 5; i++) {
    try {
      return await attempt(randomNumber(prefix));
    } catch (err) {
      const isConflict = err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002";
      if (isConflict && i < 4) continue;
      throw err;
    }
  }
  throw new Error("Failed to generate a unique number after 5 attempts");
}
