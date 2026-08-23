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

const JHANSI_BEAT_ID = "cmt3w5lxv000xlm9saxhvwi4f";
const JHANSI_TERRITORY_ID = "cmt305yiz0034er0p2rcf1g5m";
const NEERAJ_ID = "cmswmy5je00079oa9nffc08wp";

async function main() {
  const neerajCookie = await login("neerajrawatseera@gmail.com", credentialFor("neerajrawatseera@gmail.com"));
  console.log("[LOGIN] Neeraj: OK");
  const createResult = await call(neerajCookie, "/api/field/operations", "create-retailer", {
    businessName: "Jhansi Handoff Proof Retailer",
    address: { line: "Beat handoff production proof", city: "Jhansi" },
    ownerName: "Handoff Proof",
    mobile: "9998887760",
    beatId: JHANSI_BEAT_ID,
    territoryId: JHANSI_TERRITORY_ID,
    notes: "Final closure (23-Aug) Manager->Executive Beat handoff production proof — archive after verification.",
    idempotencyKey: `beat-handoff-proof-${Date.now()}`,
  });
  console.log("[CREATE RETAILER] status:", createResult.status, JSON.stringify(createResult.body));
  const retailerId = (createResult.body as { id?: string })?.id;

  const awdheshCookie = await login("amawdheshmishra350@gmail.com", credentialFor("amawdheshmishra350@gmail.com"));
  console.log("[LOGIN] Awdhesh: OK");
  const now = new Date();
  const planResult = await call(awdheshCookie, "/api/manager/operations", "create-beat-plan", {
    employeeId: NEERAJ_ID,
    territoryName: "JHANSI DIVISION",
    beatName: "JHANSI",
    geographyType: "TOWN",
    geographyName: "Jhansi Town",
    dayOfWeek: now.getDay(),
    effectiveFrom: now.toISOString(),
    notes: "Final closure (23-Aug) production Beat handoff proof",
    publish: true,
  });
  console.log("[PUBLISH PLAN] status:", planResult.status, JSON.stringify(planResult.body));

  const neerajBeat = await fetchPage(neerajCookie, "/portal/sales-executive/beat");
  console.log("[UAT] Neeraj Beat & Route contains 'Jhansi Handoff Proof Retailer':", neerajBeat.includes("Jhansi Handoff Proof Retailer"));
  console.log("[UAT] Neeraj Beat & Route contains '9998887760':", neerajBeat.includes("9998887760"));

  console.log("\nretailerId (for archival after verification):", retailerId);
}
main().catch((e) => { console.error("[ERROR]", e instanceof Error ? e.message : e); process.exitCode = 1; });
