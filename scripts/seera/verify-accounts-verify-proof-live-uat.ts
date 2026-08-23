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
async function main() {
  const nadeemCookie = await login("nadeem@gmail.com", credentialFor("nadeem@gmail.com"));
  console.log("[LOGIN] Nadeem Khan (Accounts): OK");
  const proofId = "cmt5cz8jm000l5ypy2te39jb2";
  const result = await call(nadeemCookie, "/api/finance/operations", "review-payment-proof", {
    proofId,
    status: "VERIFIED",
    reason: "Live production UAT — verified matching bank reference UAT-LIVE-PROOF-REF-001",
  });
  console.log("[VERIFY] status:", result.status, JSON.stringify(result.body).slice(0, 500));
}
main().catch((e) => { console.error("[ERROR]", e instanceof Error ? e.message : e); process.exitCode = 1; });
