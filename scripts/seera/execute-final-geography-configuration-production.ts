import { readFileSync } from "node:fs";
import path from "node:path";

// Final 100% Closure (23-Aug): executes the Founder-approved geography configuration (Part 1/2/4
// of the closure spec) against LIVE PRODUCTION via the real, deployed, authenticated application —
// never a direct DB script (lib/database/identity-guard.ts categorically blocks that). Every
// mutation here goes through the exact same governed API route/service/authorize()/audit trail a
// human clicking through the UI would use. Credentials are read from the local, gitignored
// SEERA_FINAL_CREDENTIAL_MASTER.csv (explicitly authorized for this exact purpose) and are NEVER
// printed — only high-level pass/fail/derived results reach stdout.

const BASE = "https://www.seeradetergent.in";
const root = path.resolve(import.meta.dirname, "..", "..");
const csv = readFileSync(path.join(root, "SEERA_FINAL_CREDENTIAL_MASTER.csv"), "utf8");

function credentialFor(loginId: string): string {
  for (const line of csv.split(/\r?\n/)) {
    const cols = line.split(",");
    if (cols[5]?.trim() === loginId) return cols[6]!.trim();
  }
  throw new Error(`credential not found for ${loginId} (never logging the id further)`);
}

async function login(email: string, password: string): Promise<string> {
  const res = await fetch(`${BASE}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  const setCookie = res.headers.get("set-cookie");
  if (!res.ok || !setCookie) throw new Error(`login failed status=${res.status}`);
  const match = /seera_session=([^;]+)/.exec(setCookie);
  if (!match) throw new Error("no session cookie returned");
  return `seera_session=${match[1]}`;
}

async function call(cookie: string, endpoint: string, action: string, payload: unknown) {
  const res = await fetch(`${BASE}${endpoint}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: cookie },
    body: JSON.stringify({ action, payload }),
  });
  const body = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, body };
}

async function fetchPage(cookie: string, urlPath: string): Promise<string> {
  const res = await fetch(`${BASE}${urlPath}`, { headers: { Cookie: cookie } });
  return res.text();
}

const TERRITORY = {
  BHILWARA: "cmt17fsn20000w12fba6unp4i",
  JHANSI_DIVISION: "cmt305yiz0034er0p2rcf1g5m",
};

// Evidenced, not guessed: the 11-partner cohort created 2026-08-15/16 with real, active linked
// logins matching the credential master IS the current Jhansi operational network. The 5-partner
// cohort created 2026-08-22 ("Bhilwara/Manoj onboarding gap fix", per its own code comment) has
// ZERO linked logins yet — the Bhilwara network Manoj is being onboarded onto.
const JHANSI_PARTNER_IDS = [
  "cmsuntimx000159oi05cpsk1j", // M/s Ratan Products & Traders (SUPER_STOCKIST)
  "cmsvxz15m00011154rl6cxupa", // Somya General Store
  "cmsvxzduf000k11543p1iwm4b", // Point Distributor
  "cmsvxznx3001311547fm44v96", // Aadi Stationery
  "cmsvxzy0e001m1154k3l4voct", // Dengre Kirana
  "cmsvy0837002511547kaixd0p", // Mahakal Agency
  "cmsvy0i6c002o1154loi0ayh3", // Kushwaha Agency
  "cmsvy0s8u00371154819obdwd", // Tarsoliya Traders
  "cmsvy12bv003q1154y2lm8smt", // Sahu Kirana
  "cmsvy1cf4004911544f26povw", // Sahu Kirana (dup)
  "cmsvy1mj0004s1154q0fc8urs", // Kuldeep Jha
];
const BHILWARA_PARTNER_IDS = [
  "cmt4du9y0002zgvrxeicu0cll", // Padmavati General and Kirana Store
  "cmt4dur9p0033gvrxtbf8zbhf", // Sumit Kirana Store
  "cmt4durtx0037gvrxekwh6hgb", // Amit Ji JBR
  "cmt4duta2003bgvrx9toe6745", // KGN Confectionery
  "cmt4duu61003fgvrxnk0m38dt", // Asha Enterprises
];

const TEST_BEAT_IDS = [
  "cmt3vimyj001bhfslg6ts5qqh", // Live-Verify Beat 1787372629
  "cmt4hohwj0005j66ddkct2mb6", // Empty-Beat-Live-Verify-1787412000
  "cmt4if6k00001wp8r25kco0on", // Empty-Beat-Live-Verify-2-1787415000
];

const results: Record<string, unknown> = {};

async function main() {
  const founderCookie = await login("yashsethiyami10@gmail.com", credentialFor("yashsethiyami10@gmail.com"));
  console.log("[LOGIN] Founder: OK");

  // Part 1 — Executive/Manager Territory assignments.
  const manojId = "cmt15izjh000414bqeo4fxfd9";
  const neerajRealId = "cmswmy5je00079oa9nffc08wp";
  const awdheshId = "cmstxqe9u0000gudquhbd30nl";
  results.assignManoj = (await call(founderCookie, "/api/distribution/operations", "assign-executive-territory", { userId: manojId, territoryId: TERRITORY.BHILWARA, reason: "Founder-final closure: Manoj -> Bhilwara operational territory" })).status;
  results.assignNeeraj = (await call(founderCookie, "/api/distribution/operations", "assign-executive-territory", { userId: neerajRealId, territoryId: TERRITORY.JHANSI_DIVISION, reason: "Founder-final closure: Neeraj -> Jhansi Division operational territory" })).status;
  results.assignAwdhesh = (await call(founderCookie, "/api/distribution/operations", "assign-executive-territory", { userId: awdheshId, territoryId: TERRITORY.JHANSI_DIVISION, reason: "Founder-final closure: Awdhesh -> Jhansi Division management scope" })).status;

  // Part 2 — Distributor/S.S. territoryIds backfill.
  const partnerResults: Record<string, number> = {};
  for (const id of JHANSI_PARTNER_IDS) {
    const r = await call(founderCookie, "/api/distribution/operations", "update-partner-territories", { partnerId: id, territoryIds: [TERRITORY.JHANSI_DIVISION], reason: "Founder-final closure: Jhansi operational network (evidenced by active linked logins, 15/16-Aug onboarding cohort)" });
    partnerResults[id] = r.status;
  }
  for (const id of BHILWARA_PARTNER_IDS) {
    const r = await call(founderCookie, "/api/distribution/operations", "update-partner-territories", { partnerId: id, territoryIds: [TERRITORY.BHILWARA], reason: "Founder-final closure: Bhilwara/Manoj onboarding cohort (22-Aug)" });
    partnerResults[id] = r.status;
  }
  results.partnerTerritories = partnerResults;

  // Part 4 — Deactivate known test-artifact Beats.
  const beatResults: Record<string, number> = {};
  for (const id of TEST_BEAT_IDS) {
    const r = await call(founderCookie, "/api/distribution/operations", "update-geography-node", { nodeId: id, status: "INACTIVE" });
    beatResults[id] = r.status;
  }
  results.testBeatsDeactivated = beatResults;

  // Part 5 — Retailer cleanup verification (should already be 0 per prior session).
  const cleanup = await call(founderCookie, "/api/distribution/operations", "retailer-cleanup-overview", {});
  results.activeTestRetailersRemaining = Array.isArray(cleanup.body) ? cleanup.body.length : cleanup.body;

  console.log("[FOUNDER CONFIGURATION RESULTS]", JSON.stringify(results, null, 2));

  // Part 3/UAT — live scoped-render verification as each real Executive/Manager.
  const manojCookie = await login("manojvijay@seera.local", credentialFor("manojvijay@seera.local"));
  console.log("[LOGIN] Manoj: OK");
  const manojToday = await fetchPage(manojCookie, "/portal/sales-executive/today");
  console.log("[UAT] Manoj /today contains 'JHANSI':", manojToday.toUpperCase().includes("JHANSI"));
  console.log("[UAT] Manoj /today contains 'BHILWARA':", manojToday.toUpperCase().includes("BHILWARA"));

  const neerajCookie = await login("neerajrawatseera@gmail.com", credentialFor("neerajrawatseera@gmail.com"));
  console.log("[LOGIN] Neeraj (real): OK");
  const neerajToday = await fetchPage(neerajCookie, "/portal/sales-executive/today");
  console.log("[UAT] Neeraj /today contains 'JHANSI':", neerajToday.toUpperCase().includes("JHANSI"));
  console.log("[UAT] Neeraj /today contains 'BHILWARA':", neerajToday.toUpperCase().includes("BHILWARA"));

  const awdheshCookie = await login("amawdheshmishra350@gmail.com", credentialFor("amawdheshmishra350@gmail.com"));
  console.log("[LOGIN] Awdhesh: OK");
  const beatPlanner = await fetchPage(awdheshCookie, "/portal/sales-manager/beat-planner");
  console.log("[UAT] Awdhesh beat-planner contains 'Padmavati':", beatPlanner.includes("Padmavati"));
  console.log("[UAT] Awdhesh beat-planner contains 'Sumit Kirana':", beatPlanner.includes("Sumit Kirana"));
  console.log("[UAT] Awdhesh beat-planner contains 'Kuldeep Jha':", beatPlanner.includes("Kuldeep Jha"));
  console.log("[UAT] Awdhesh beat-planner contains 'Somya General Store':", beatPlanner.includes("Somya General Store"));
}

main().catch((e) => {
  console.error("[ERROR]", e instanceof Error ? e.message : e);
  process.exitCode = 1;
});
