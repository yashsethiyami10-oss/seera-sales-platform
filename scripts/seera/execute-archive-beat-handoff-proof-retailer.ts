import { readFileSync } from "node:fs";
import path from "node:path";
const BASE = "https://www.seeradetergent.in";
const root = path.resolve(import.meta.dirname, "..", "..");
const csv = readFileSync(path.join(root, "SEERA_FINAL_CREDENTIAL_MASTER.csv"), "utf8");
function credentialFor(loginId: string): string {
  for (const line of csv.split(/\r?\n/)) {
    const cols = line.split(",");
    if (cols[5]?.trim() === loginId) return cols[6]!.trim();
  }
  throw new Error(`credential not found for ${loginId}`);
}
async function login(email: string, password: string): Promise<string> {
  const res = await fetch(`${BASE}/api/auth/login`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, password }) });
  const setCookie = res.headers.get("set-cookie");
  if (!res.ok || !setCookie) throw new Error(`login failed status=${res.status}`);
  return `seera_session=${/seera_session=([^;]+)/.exec(setCookie)![1]}`;
}
async function main() {
  const cookie = await login("yashsethiyami10@gmail.com", credentialFor("yashsethiyami10@gmail.com"));
  const res = await fetch(`${BASE}/api/distribution/operations`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: cookie },
    body: JSON.stringify({ action: "archive-retailer", payload: { retailerId: "cmt584m1n000m19nq1k9f3u9n", reason: "Final closure (23-Aug): Manager->Executive Beat handoff production proof complete — archiving temporary UAT retailer, real beat/handoff mechanism already verified live." } }),
  });
  console.log("archive status:", res.status, JSON.stringify(await res.json().catch(() => ({}))));
  const overview = await fetch(`${BASE}/api/distribution/operations`, { method: "POST", headers: { "Content-Type": "application/json", Cookie: cookie }, body: JSON.stringify({ action: "retailer-cleanup-overview", payload: {} }) });
  const body = await overview.json().catch(() => ([]));
  console.log("remaining active test retailers:", Array.isArray(body) ? body.length : body);
}
main().catch((e) => { console.error("[ERROR]", e instanceof Error ? e.message : e); process.exitCode = 1; });
