// TEST-only, read-only HTTP-runtime performance benchmark across every regularly-used Seera
// portal (Performance Phase 3 / Part 5 all-portal audit). Drives the SAME sin1 Vercel Preview
// deployment (already confirmed connected to TEST DB, never production) that the Executive-only
// pass used, logging in as each portal's review-*@seera.test fixture and timing real GET page
// loads (dashboard + a few representative list views per portal) — no mutations, nothing written,
// safe to re-run any number of times.
//
// Usage: PERF_BASE_URL=https://<preview>.vercel.app PERF_BYPASS=<secret> npx tsx scripts/seera/perf-baseline-all-portals-http.ts

const BASE_URL = process.env.PERF_BASE_URL;
const BYPASS = process.env.PERF_BYPASS;
const ITERATIONS = Number(process.env.PERF_ITERATIONS ?? 10);
if (!BASE_URL) throw new Error("PERF_BASE_URL is required");

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

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

type PortalSpec = { portalLabel: string; email: string; base: string; pages: { slug: string; label: string }[] };

const PORTALS: PortalSpec[] = [
  {
    portalLabel: "Sales Manager",
    email: "review-sales-manager-1@seera.test",
    base: "/portal/sales-manager",
    pages: [
      { slug: "", label: "manager-dashboard" },
      { slug: "/team", label: "manager-team" },
      { slug: "/team-review", label: "manager-team-review" },
      { slug: "/approvals", label: "manager-approvals" },
      { slug: "/beat-planner", label: "manager-beat-planner" },
    ],
  },
  {
    portalLabel: "Distributor",
    email: "review-distributor-owner@seera.test",
    base: "/portal/distributor",
    pages: [
      { slug: "", label: "distributor-dashboard" },
      { slug: "/fulfilment", label: "distributor-orders" },
      { slug: "/inventory", label: "distributor-stock" },
      { slug: "/retailers", label: "distributor-retailers" },
      { slug: "/ledgers", label: "distributor-ledger" },
    ],
  },
  {
    portalLabel: "Super Stockist",
    email: "review-ss-owner@seera.test",
    base: "/portal/super-stockist",
    pages: [
      { slug: "", label: "ss-dashboard" },
      { slug: "/distributor-orders", label: "ss-distributor-orders" },
      { slug: "/inventory", label: "ss-stock" },
      { slug: "/distributors", label: "ss-distributors" },
    ],
  },
  {
    portalLabel: "Founder/Admin",
    email: "review-founder@seera.test",
    base: "/portal/founder-admin",
    pages: [
      { slug: "", label: "founder-dashboard" },
      { slug: "/orders", label: "founder-orders" },
      { slug: "/distributors", label: "founder-distributors" },
      { slug: "/retailers", label: "founder-retailers" },
    ],
  },
  {
    portalLabel: "Accounts/Finance",
    email: "review-accounts-manager@seera.test",
    base: "/portal/accounts",
    pages: [
      { slug: "", label: "accounts-dashboard" },
      { slug: "/ledgers", label: "accounts-ledgers" },
      { slug: "/payments", label: "accounts-payments" },
    ],
  },
];

async function main() {
  console.log(`Benchmarking all portals against ${BASE_URL} (read-only page loads, TEST DB fixtures only)`);
  for (const portal of PORTALS) {
    console.log(`\n=== ${portal.portalLabel} (${portal.email}) ===`);
    let cookie: string;
    try {
      cookie = await login(portal.email);
    } catch (error) {
      console.error(`  LOGIN FAILED — skipping ${portal.portalLabel}:`, error instanceof Error ? error.message : error);
      continue;
    }
    // Login itself is IP-rate-limited (5/5min) — space out portal logins comfortably.
    await sleep(2000);
    for (const page of portal.pages) {
      for (let i = 0; i < ITERATIONS; i++) {
        try {
          await getPage(cookie, `${portal.base}${page.slug}`, page.label);
        } catch (error) {
          console.error(`  ${page.label} iteration ${i} failed:`, error instanceof Error ? error.message : error);
        }
      }
    }
  }

  console.log("\n\n========== ALL-PORTAL HTTP BASELINE RESULTS (ms) ==========");
  for (const portal of PORTALS) {
    console.log(`\n${portal.portalLabel}:`);
    for (const page of portal.pages) {
      const s = stats(page.label);
      if (s) console.log(`  ${page.label.padEnd(24)} n=${s.n}  p50=${s.p50}ms  p95=${s.p95}ms  p98=${s.p98}ms  max=${s.max}ms`);
      else console.log(`  ${page.label.padEnd(24)} NO DATA (login or all requests failed)`);
    }
  }
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
