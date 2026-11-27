/**
 * Read-only Seera data for Hanuman (2026-11-27): the Founder's AI chief of staff reads Seera's numbers
 * through the signed relay instead of holding a database URL (Netlify never reveals a secret value
 * to another site). One SELECT, inside a READ ONLY transaction with an 8 s timeout, at most 200 rows;
 * credential-like columns (passwords, hashes, tokens, secrets) are removed from every row.
 */
import { createHmac, timingSafeEqual } from "node:crypto";
import { prisma } from "@/lib/prisma";
class AppError extends Error { constructor(message: string, public status: number, public code: string) { super(message); } }

export const MAX_ROWS = 200;
const SECRET_COLUMN = /(password|hash|secret|token|otp|pepper|apikey|api_key)/i;

export function assertReadOnlySql(sql: string): void {
  const s = sql.trim().replace(/;\s*$/, "");
  if (s.includes(";")) throw new AppError("Only one statement is allowed.", 400, "BAD_SQL");
  if (!/^(select|with)\b/i.test(s)) throw new AppError("Only SELECT (or WITH ... SELECT) queries are allowed.", 400, "BAD_SQL");
  if (/\b(insert|update|delete|merge|drop|alter|create|truncate|grant|revoke|copy|call|do|vacuum|lock|set|reset|set_config|pg_sleep|pg_terminate_backend|pg_cancel_backend|pg_reload_conf|pg_read_file|pg_read_binary_file|pg_ls_dir|pg_stat_file|dblink|lo_import|lo_export|lo_get|lo_put)\b/i.test(s.replace(/'[^']*'/g, "''"))) {
    throw new AppError("Write, DDL or session keywords are not allowed in a read-only query.", 400, "BAD_SQL");
  }
}

function clean(row: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(row)) {
    if (SECRET_COLUMN.test(k)) continue;
    out[k] = typeof v === "bigint" ? Number(v) : v !== null && typeof v === "object" && "toFixed" in (v as object) && "d" in (v as object) ? String(v) : v;
  }
  return out;
}

export async function readQuery(sql: string): Promise<{ rows: Record<string, unknown>[]; truncated: boolean }> {
  assertReadOnlySql(sql);
  const rows = await prisma.$transaction(async (tx) => {
    await tx.$executeRawUnsafe("SET TRANSACTION READ ONLY");
    await tx.$executeRawUnsafe("SET LOCAL statement_timeout = 8000");
    return tx.$queryRawUnsafe<Record<string, unknown>[]>(sql.trim().replace(/;\s*$/, ""));
  }, { timeout: 12000 });
  return { rows: rows.slice(0, MAX_ROWS).map(clean), truncated: rows.length > MAX_ROWS };
}

/** HMAC-SHA256 of the raw body, "sha256=<hex>", compared in constant time. */
export function hanumanSignatureOk(raw: string, header: string | null, secret: string | undefined): boolean {
  if (!secret || !header) return false;
  const expected = "sha256=" + createHmac("sha256", secret).update(raw).digest("hex");
  return header.length === expected.length && timingSafeEqual(Buffer.from(header), Buffer.from(expected));
}
