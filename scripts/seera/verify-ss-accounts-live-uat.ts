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
    if (inQuotes) {
      if (c === '"') inQuotes = false;
      else cur += c;
    } else if (c === '"') inQuotes = true;
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
async function fetchPage(cookie: string, urlPath: string): Promise<{ status: number; text: string }> {
  const res = await fetch(`${BASE}${urlPath}`, { headers: { Cookie: cookie } });
  return { status: res.status, text: await res.text() };
}
async function main() {
  const ssCookie = await login("9936399605", credentialFor("9936399605"));
  console.log("[LOGIN] Prateek Singh (S.S. Owner): OK");
  const companyOrders = await fetchPage(ssCookie, "/portal/super-stockist/company-orders");
  console.log("[UAT] company-orders page status:", companyOrders.status);
  console.log("[UAT] contains ADD TO ORDER:", companyOrders.text.includes("ADD TO ORDER"));
  console.log("[UAT] contains BAG (powder default):", companyOrders.text.includes(">BAG<") || companyOrders.text.includes("BAG"));
  console.log("[UAT] contains BOX (cake default):", companyOrders.text.includes("BOX"));

  const nadeemCookie = await login("nadeem@gmail.com", credentialFor("nadeem@gmail.com"));
  console.log("[LOGIN] Nadeem Khan (Accounts): OK");
  const financeOps = await fetchPage(nadeemCookie, "/portal/accounts/payment-inbox");
  console.log("[UAT] accounts payment-inbox page status:", financeOps.status);
  const moneyDesk = await fetchPage(nadeemCookie, "/portal/accounts/money-desk");
  console.log("[UAT] accounts money-desk page status:", moneyDesk.status);
}
main().catch((e) => { console.error("[ERROR]", e instanceof Error ? e.message : e); process.exitCode = 1; });
