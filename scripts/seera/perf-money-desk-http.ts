// TEST-only, read/write HTTP-runtime performance benchmark for Money Desk (Part D targets) against
// the sin1 Vercel Preview deployment connected only to TEST DB. Same convention as
// perf-baseline-all-portals-http.ts. Safe to re-run — each write uses a fresh idempotencyKey.
//
// Usage: PERF_BASE_URL=https://<preview>.vercel.app PERF_BYPASS=<secret> npx tsx scripts/seera/perf-money-desk-http.ts

const BASE_URL = process.env.PERF_BASE_URL;
const BYPASS = process.env.PERF_BYPASS;
const ITERATIONS = Number(process.env.PERF_ITERATIONS ?? 15);
if (!BASE_URL) throw new Error("PERF_BASE_URL is required");

type Sample = { label: string; ms: number };
const samples: Sample[] = [];
async function time<T>(label: string, fn: () => Promise<T>): Promise<T> {
  const start = performance.now();
  const result = await fn();
  samples.push({ label, ms: performance.now() - start });
  return result;
}
function stats(label: string) {
  const vals = samples.filter((s) => s.label === label).map((s) => s.ms).sort((a, b) => a - b);
  if (vals.length === 0) return null;
  const pct = (p: number) => vals[Math.min(vals.length - 1, Math.floor(vals.length * p))];
  return { n: vals.length, p50: Math.round(pct(0.5)!), p95: Math.round(pct(0.95)!), p98: Math.round(pct(0.98)!), max: Math.round(vals[vals.length - 1]!) };
}
function headers(extra: Record<string, string> = {}) {
  return { ...extra, ...(BYPASS ? { "x-vercel-protection-bypass": BYPASS } : {}) };
}
async function login(email: string): Promise<string> {
  const r = await fetch(`${BASE_URL}/api/auth/login`, {
    method: "POST",
    headers: headers({ "Content-Type": "application/json" }),
    body: JSON.stringify({ email, password: "SeeraReview!2026" }),
  });
  const body = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`login ${email} failed: ${r.status} ${JSON.stringify(body)}`);
  const setCookie = r.headers.get("set-cookie");
  if (!setCookie) throw new Error(`login ${email}: no set-cookie header`);
  return setCookie.split(";")[0]!;
}
async function getPage(cookie: string, pagePath: string, label: string) {
  await time(label, async () => {
    const r = await fetch(`${BASE_URL}${pagePath}`, { headers: headers({ Cookie: cookie }) });
    if (!r.ok) throw new Error(`${pagePath} failed: ${r.status}`);
    await r.text();
  });
}
async function post(cookie: string, action: string, payload: unknown, label: string) {
  return time(label, async () => {
    const r = await fetch(`${BASE_URL}/api/finance/company-operations`, {
      method: "POST",
      headers: headers({ Cookie: cookie, "Content-Type": "application/json" }),
      body: JSON.stringify({ action, payload }),
    });
    const body = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(`${action} failed: ${r.status} ${JSON.stringify(body)}`);
    return body;
  });
}

async function main() {
  console.log(`Benchmarking Money Desk against ${BASE_URL} (TEST DB fixtures only)`);
  const cookie = await login("review-accounts-manager@seera.test");

  // Home page load (server-render includes moneyDeskHome + moneyDeskSupportingData)
  for (let i = 0; i < ITERATIONS; i++) {
    await getPage(cookie, "/portal/accounts/money-desk", "money-desk-home");
  }

  // Simple transaction post (EXP-OFFICE, auto-clears, no approval detour)
  for (let i = 0; i < ITERATIONS; i++) {
    await post(
      cookie,
      "money-desk-create",
      {
        purposeCode: "EXP-OFFICE",
        direction: "CASH_OUT",
        amount: 100 + i,
        date: new Date().toISOString(),
        formData: {},
        idempotencyKey: `perf-http-md-${Date.now()}-${i}-${Math.random().toString(36).slice(2)}`,
      },
      "money-desk-simple-post",
    );
  }

  console.log("\n\n========== MONEY DESK HTTP BASELINE RESULTS (ms) ==========");
  for (const label of ["money-desk-home", "money-desk-simple-post"]) {
    const s = stats(label);
    if (s) console.log(`  ${label.padEnd(24)} n=${s.n}  p50=${s.p50}ms  p95=${s.p95}ms  p98=${s.p98}ms  max=${s.max}ms`);
    else console.log(`  ${label.padEnd(24)} NO DATA`);
  }
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
