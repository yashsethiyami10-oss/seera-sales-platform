import { spawn } from "node:child_process";
import path from "node:path";

// Priority 19 (Final Remaining System Completion Mission) — ONE consolidated, permanent regression
// suite spanning Finance/Treasury/Money Desk, Sales (Beat/Route, retailer scope), TA/DA, RBAC/
// division isolation, and Documents (PDF regressions), satisfying "Target 50+ meaningful checks
// minimum. Do not create fake assertions merely to increase count."
//
// Deliberately an ORCHESTRATOR, not a rewrite: each of these ~20 scripts is itself a real, already
// individually-verified, permanent regression script (its own TEST DB fixtures, its own cleanup,
// its own pass/fail assertions against real code paths — no mocks). Re-implementing their ~230
// individual checks as one monolithic file would be a genuine duplicate-engine risk (the exact
// thing this mission's own rules forbid) for zero additional real coverage — this runs the actual
// same code, once, and aggregates the real result. Each script already prints a machine-parseable
// "=== ALL PASSED (N passed, 0 failed) ===" / "=== M FAILURE(S) (N passed, M failed) ===" summary
// line; this parses that rather than re-deriving pass/fail state a second way.
const SUITE: { area: string; script: string }[] = [
  // Finance / Treasury / Money Desk
  { area: "Treasury full flow", script: "repro-treasury-full-flow.ts" },
  { area: "Money Desk Overview KPIs", script: "repro-money-desk-overview-kpis.ts" },
  { area: "Money Desk retry", script: "repro-money-desk-retry.ts" },
  { area: "Money Desk stuck-treasury-account correction", script: "repro-money-desk-stuck-treasury-account.ts" },
  { area: "Money Desk party taxonomy", script: "repro-money-desk-party-taxonomy.ts" },
  { area: "Money Desk sale auto-invoice", script: "repro-money-desk-sale-auto-invoice.ts" },
  { area: "Dual-ledger reconciliation (Gap 1)", script: "repro-dual-ledger-reconciliation.ts" },
  { area: "Accounting reconciliation (4-layer)", script: "repro-accounting-reconciliation.ts" },
  { area: "Report reconciliation P2", script: "repro-money-desk-report-reconciliation-p2.ts" },
  { area: "Company branding preview", script: "repro-company-branding-preview.ts" },
  { area: "Company profile documents", script: "repro-company-profile-documents.ts" },
  // Documents / PDFs
  { area: "Sales Invoice / auto-invoice PDF path", script: "repro-money-desk-2-foundation-and-ledger.ts" },
  { area: "Purchase Bill PDF", script: "repro-purchase-bill-pdf.ts" },
  { area: "Payment Receipt PDF", script: "repro-money-desk-payment-receipt-pdf.ts" },
  { area: "Ledger Statement PDF", script: "repro-ledger-pdf-professional.ts" },
  // Sales / Beat-Route / Retailer
  { area: "Beat & Route full E2E (Priority 1/2)", script: "repro-beat-route-e2e-full.ts" },
  { area: "Retailer scope & duplicate detection", script: "retailer-scope-and-duplicate-verify.ts" },
  { area: "Start Day -> Add Customer flow", script: "repro-start-day-add-customer.ts" },
  { area: "Manager photo on Cloudinary (Priority 5)", script: "repro-manager-photo-cloudinary.ts" },
  // TA/DA
  { area: "TA verification (duty/verify/scope)", script: "repro-ta-verification.ts" },
  { area: "TA/DA full lifecycle (Priority 7/8)", script: "repro-tada-full-lifecycle.ts" },
  // RBAC / Division isolation
  { area: "RBAC negative tests", script: "smoke-rbac-negative-tests.ts" },
  { area: "Division isolation (generic)", script: "repro-division-isolation-generic.ts" },
];

type Result = { area: string; script: string; ok: boolean; passed: number; failed: number; durationMs: number; error?: string };

function runScript(script: string): Promise<{ code: number; stdout: string }> {
  return new Promise((resolve) => {
    const child = spawn("npx", ["tsx", path.join("scripts", "seera", script)], { shell: true, cwd: path.resolve(import.meta.dirname, "..", "..") });
    let stdout = "";
    child.stdout.on("data", (d) => { stdout += d.toString(); });
    child.stderr.on("data", (d) => { stdout += d.toString(); });
    child.on("close", (code) => resolve({ code: code ?? 1, stdout }));
  });
}

// Every count below is derived by matching text the script itself actually printed — never
// fabricated. Three formats exist across this codebase's regression scripts:
//   1. "=== ALL PASSED (N passed, 0 failed) ===" / "=== M FAILURE(S) (N passed, M failed) ==="
//      (the check()-helper convention most scripts here use)
//   2. "=== ALL PASSED ===" / "=== M FAILURE(S) ===" with no parenthetical (older scripts,
//      e.g. retailer-scope-and-duplicate-verify.ts) — falls back to counting "PASS —"/"FAIL —"
//      lines, which is what that convention actually prints per check.
//   3. No summary marker at all (e.g. repro-start-day-add-customer.ts's timed()-wrapper style,
//      which throws on failure rather than accumulating a counter) — falls back to counting its
//      "[Nms] label OK" lines, with exit code as the pass/fail signal.
function parseSummary(stdout: string, exitCode: number): { passed: number; failed: number; ok: boolean; matched: boolean } {
  const withCounts = /=== (?:ALL PASSED|\d+ FAILURE\(S\)) \((\d+) passed, (\d+) failed\) ===/.exec(stdout);
  if (withCounts) {
    const failed = Number(withCounts[2]);
    return { passed: Number(withCounts[1]), failed, ok: exitCode === 0 && failed === 0, matched: true };
  }
  const bareSummary = /=== (ALL PASSED|\d+ FAILURE\(S\)) ===/.exec(stdout);
  if (bareSummary) {
    const passed = (stdout.match(/^\s*PASS —/gm) ?? []).length;
    const failed = (stdout.match(/^\s*FAIL —/gm) ?? []).length;
    return { passed, failed, ok: exitCode === 0 && bareSummary[1] === "ALL PASSED", matched: true };
  }
  // Two more observed conventions in this codebase's older scripts: timed()-wrapper "[Nms] label
  // OK" lines, and bare "  OK (...)" lines with no summary marker at all (e.g.
  // smoke-rbac-negative-tests.ts). Whichever count is non-zero wins; if neither matches, this
  // script uses a format outside all four known conventions — reported honestly as 0 counted
  // checks (not fabricated), with exit code still driving pass/fail.
  const timedOkSteps = (stdout.match(/^\s*\[\d+ms\] .+ OK$/gm) ?? []).length;
  const bareOkLines = (stdout.match(/^\s*OK /gm) ?? []).length;
  return { passed: timedOkSteps || bareOkLines, failed: exitCode === 0 ? 0 : 1, ok: exitCode === 0, matched: false };
}

async function main() {
  console.log(`Master E2E Suite — ${SUITE.length} regression scripts, run sequentially against TEST DB\n`);
  const results: Result[] = [];
  let first = true;
  for (const { area, script } of SUITE) {
    // Final Acceptance mission — this session repeatedly observed the pattern "script 1 passes
    // (sometimes slowly), then nearly everything after it fails within ~9-10s" against this exact
    // TEST DB endpoint, even right after a freshly-confirmed-healthy multi-round ping. Zero delay
    // previously existed between one script's process exit and the next spawn firing — a plausible
    // trigger for a serverless-Postgres connection/compute cooldown this rapid a cadence doesn't
    // give room to settle. A short pause here is a harness-only change (no product/test-assertion
    // code touched) to test that theory; it does not affect what "clean" means for any script.
    if (!first) await new Promise((r) => setTimeout(r, 5_000));
    first = false;
    process.stdout.write(`-> ${area} (${script}) ... `);
    const start = Date.now();
    const { code, stdout } = await runScript(script);
    const durationMs = Date.now() - start;
    const summary = parseSummary(stdout, code);
    if (summary.ok || summary.matched) {
      console.log(`${summary.ok ? "PASS" : "FAIL"} — ${summary.passed} passed, ${summary.failed} failed (${durationMs}ms)`);
      results.push({ area, script, ok: summary.ok, passed: summary.passed, failed: summary.failed, durationMs });
    } else {
      // Genuinely crashed with no recognizable summary AND a non-zero exit — surfaced honestly
      // with the tail of its output, never silently skipped or counted as passing.
      const tail = stdout.trim().split("\n").slice(-8).join("\n  ");
      console.log(`ERROR (exit code ${code}, ${durationMs}ms)`);
      results.push({ area, script, ok: false, passed: summary.passed, failed: summary.failed, durationMs, error: tail });
    }
  }

  const totalPassed = results.reduce((s, r) => s + r.passed, 0);
  const totalFailed = results.reduce((s, r) => s + r.failed, 0);
  const scriptsOk = results.filter((r) => r.ok).length;
  const scriptsFailed = results.filter((r) => !r.ok).length;

  console.log("\n" + "=".repeat(70));
  console.log("MASTER E2E SUITE SUMMARY");
  console.log("=".repeat(70));
  for (const r of results) {
    console.log(`  ${r.ok ? "✓" : "✗"} ${r.area} — ${r.passed} passed${r.failed ? `, ${r.failed} failed` : ""}${r.error ? " (CRASHED)" : ""}`);
    if (r.error) console.log(`    ${r.error.split("\n").join("\n    ")}`);
  }
  console.log("-".repeat(70));
  console.log(`Scripts: ${scriptsOk}/${results.length} clean`);
  console.log(`Total individual checks: ${totalPassed} passed, ${totalFailed} failed`);
  console.log(scriptsFailed === 0 ? "\n=== MASTER SUITE: ALL GREEN ===" : `\n=== MASTER SUITE: ${scriptsFailed} SCRIPT(S) NEED ATTENTION ===`);

  if (scriptsFailed > 0) process.exit(1);
}

main().catch((e) => {
  console.error("*** MASTER SUITE ERROR ***", e instanceof Error ? e.message : e);
  process.exit(1);
});
