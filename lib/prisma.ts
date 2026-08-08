import { PrismaClient } from "@prisma/client";

// Next.js dev-mode hot-reloading re-executes this module on every change.
// Without this global-caching pattern, each reload would instantiate a new
// PrismaClient and a new connection pool, quickly exhausting Postgres'
// connection limit. In production (NODE_ENV=production) this runs once.

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["query", "error", "warn"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
