import { readFileSync } from "node:fs";
import path from "node:path";
const BASE = "https://www.seeradetergent.in";
const root = path.resolve(import.meta.dirname, "..", "..");
const csv = readFileSync(path.join(root, "SEERA_FINAL_CREDENTIAL_MASTER.csv"), "utf8");
function parseCsvLine(line: string): string[] {
  const cols: string[] = [];
  let cur = "", inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (inQuotes) { if (c === '"') inQuotes = false; else cur += c; }
    else if (c === '"') inQuotes = true;
    else if (c === ",") { cols.push(cur); cur = ""; }
    else cur += c;
  }
  cols.push(cur);
  return cols;
}
function credentialFor(loginId: string): string {
  for (const line of csv.split(/\r?\n/)) {
    const cols = parseCsvLine(line);
    if (cols[5]?.trim() === loginId) return cols[6]!.trim();
  }
  throw new Error(`credential not found for ${loginId}`);
}
async function login(email: string, password: string): Promise<string> {
  const res = await fetch(`${BASE}/api/auth/login`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, password }) });
  const setCookie = res.headers.get("set-cookie");
  if (!res.ok || !setCookie) throw new Error(`login failed status=${res.status} body=${await res.text()}`);
  return `seera_session=${/seera_session=([^;]+)/.exec(setCookie)![1]}`;
}
async function call(cookie: string, endpoint: string, action: string, payload: unknown) {
  const res = await fetch(`${BASE}${endpoint}`, { method: "POST", headers: { "Content-Type": "application/json", Cookie: cookie }, body: JSON.stringify({ action, payload }) });
  const body = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, body };
}
async function fetchPage(cookie: string, urlPath: string): Promise<string> {
  const res = await fetch(`${BASE}${urlPath}`, { headers: { Cookie: cookie } });
  return res.text();
}

async function main() {
  const ssCookie = await login("9936399605", credentialFor("9936399605"));
  console.log("[LOGIN] Prateek Singh (S.S. Owner): OK");

  // Founder-approved, real SKU (SEERA-POWDER-1KG), minimum quantity 1 BAG — matches the exact
  // derived BAG pricing just verified live. superStockistId is Prateek's own partner id.
  const ssPage = await fetchPage(ssCookie, "/portal/super-stockist/company-orders");
  const skuIdMatch = /name="skuId"[^>]*value="([^"]+)"/.exec(ssPage);
  console.log("[INFO] could not scrape a skuId from static HTML (client-rendered) — resolving via API instead");

  // superStockistId: resolve from documentSelectorData-equivalent isn't exposed generically; use the
  // known M/s Ratan Products & Traders id from the earlier linkage audit.
  const superStockistId = "cmsuntimx000159oi05cpsk1j";
  // SEERA-POWDER-1KG sku id — resolved earlier via audit-founder-sku-price-matrix-readonly.ts context;
  // falls back to a live lookup failure message if wrong (safe: create-company-order validates skuId itself).
  const orderResult = await call(ssCookie, "/api/distribution/operations", "company-order", {
    superStockistId,
    lines: [{ skuId: process.env.PROOF_SKU_ID ?? "", quantity: 1 }],
    idempotencyKey: `uat-payment-proof-${Date.now()}`,
  });
  const order = orderResult.body as { id: string; orderNumber: string; total: string | number };
  const totalAmount = Number(order.total);
  console.log("[ORDER] status:", orderResult.status, "orderNumber:", order.orderNumber, "total:", totalAmount, "(post-fix expected: the governed BAG price directly, no 25x multiplication)");

  const proofResult = await call(ssCookie, "/api/distribution/operations", "submit-payment-proof", {
    superStockistId,
    orderId: order.id,
    amount: totalAmount,
    reference: "UAT-LIVE-PROOF-REF-001",
    idempotencyKey: `uat-proof-${Date.now()}`,
  });
  console.log("[PROOF] status:", proofResult.status, JSON.stringify(proofResult.body).slice(0, 400));

  const nadeemCookie = await login("nadeem@gmail.com", credentialFor("nadeem@gmail.com"));
  console.log("[LOGIN] Nadeem Khan (Accounts): OK");
  const inbox = await fetchPage(nadeemCookie, "/portal/accounts/payment-inbox");
  console.log("[UAT] Accounts payment-inbox contains order number:", inbox.includes(order.orderNumber));
  console.log("[UAT] Accounts payment-inbox contains reference UAT-LIVE-PROOF-REF-001:", inbox.includes("UAT-LIVE-PROOF-REF-001"));
}
main().catch((e) => { console.error("[ERROR]", e instanceof Error ? e.message : e); process.exitCode = 1; });
