import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as { seeraPrisma?: PrismaClient };
export const prisma = globalForPrisma.seeraPrisma ?? new PrismaClient();
if (process.env.NODE_ENV !== "production") globalForPrisma.seeraPrisma = prisma;
