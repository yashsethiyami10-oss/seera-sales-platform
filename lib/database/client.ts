// The independent Seera foundation uses the same process-wide Prisma singleton
// as inherited runtime modules. Keeping a second global key here creates a
// second connection pool during Next.js route composition and hot reloads.
// This compatibility export preserves every existing import while guaranteeing
// one PrismaClient and one pool per server process.
export { prisma } from "@/lib/prisma";
