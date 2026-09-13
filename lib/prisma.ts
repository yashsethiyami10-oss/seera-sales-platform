import { PrismaClient } from "@prisma/client";

// Next.js dev-mode hot-reloading re-executes this module on every change.
// Without this global-caching pattern, each reload would instantiate a new
// PrismaClient and a new connection pool, quickly exhausting Postgres'
// connection limit. In production (NODE_ENV=production) this runs once.

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

// Post-Audit Gap Closure, Founder Dashboard performance — root cause of the measured 5-15s Founder/
// Finance dashboard load was NOT any single report being slow (the heaviest individual read measured
// ~3.3s) but connection-pool queuing: financeWorkspaceData() fires ~26 genuinely-independent reads
// in one Promise.all, and this DATABASE_URL has never had a `connection_limit` set, so Prisma falls
// back to its bare default (num_physical_cpus * 2 + 1 — a small number on a typical serverless
// instance), forcing most of those 26 queries to queue for a connection rather than run concurrently.
// This mirrors the exact same fix already applied, ad hoc, in dozens of this session's own TEST-DB
// scripts (`connection_limit=10&pool_timeout=30`) — applying it once, here, at the single shared
// production client, benefits every concurrent-query workflow in the app, not just this one
// dashboard, with zero change to any report/business-logic function. Neon's own server-side ceiling
// is far higher (900+ on this project) — 10 is a conservative, well-precedented increase from the
// unset default, not the DB's real limit. Query-string params the URL already sets (if any) win —
// this only fills in what's genuinely absent.
function withPoolTuning(url: string | undefined): string | undefined {
  if (!url) return url;
  try {
    const parsed = new URL(url);
    if (!parsed.searchParams.has("connection_limit")) parsed.searchParams.set("connection_limit", "10");
    if (!parsed.searchParams.has("pool_timeout")) parsed.searchParams.set("pool_timeout", "30");
    return parsed.toString();
  } catch {
    return url; // an unparsable value is left exactly as-is — never silently swapped for something else
  }
}

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    datasourceUrl: withPoolTuning(process.env.DATABASE_URL),
    log: process.env.NODE_ENV === "development" ? ["query", "error", "warn"] : ["error"],
    transactionOptions: { maxWait: 60_000, timeout: 60_000 },
  });

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
