import { spawnSync } from "node:child_process";
import path from "node:path";

// Single permanent entry point for restoring the review-*@seera.test fixture
// accounts (see MEMORY.md / seera_freeze_contract.md for why this exists):
// several TEST-only integration suites (seera-block3, phase2-5/6-9/10/11
// integration) TRUNCATE the entire users/roles/permissions table CASCADE as
// part of their own legitimate "bootstrap from an empty DB" test coverage —
// that is real, intentional test behavior, not a bug, and is not being
// weakened here. This script is what undoes the side effect afterward:
// step 1 recreates any review user that is fully absent (upsert, fixed
// TEST password, correct role) and step 2 repairs any review user that
// exists but is inactive, has a stale password, or lost its role
// assignment. Both steps are idempotent — safe to run any number of times,
// never rotates the password randomly, never duplicates users.
const root = path.resolve(import.meta.dirname, "..", "..");
const tsx = path.resolve(root, "node_modules", "tsx", "dist", "cli.mjs");

function run(label: string, scriptPath: string, args: string[] = []) {
  console.log(`\n[RESTORE REVIEW USERS] ${label}`);
  const result = spawnSync(process.execPath, [tsx, scriptPath, ...args], {
    cwd: root,
    stdio: "inherit",
  });
  if (result.error) throw result.error;
  if ((result.status ?? 1) !== 0) {
    throw new Error(`${label} failed with exit code ${result.status}`);
  }
}

run(
  "1/2 seed base fixtures (recreates any fully-missing review user)",
  path.join(root, "scripts", "seera", "seed-integrated-review.ts"),
);
run(
  "2/3 repair credentials, active status, and role assignments",
  path.join(root, "scripts", "seera", "review-access-recovery.ts"),
  ["--repair"],
);
// The same TRUNCATE ... CASCADE that wipes users also empties SeeraSku (Cross-Portal Product
// Catalog Correction pass) — without this step the canonical 9-item Seera catalog + MUV import
// silently disappear after any block3/phase2-5/6-9/10/11 integration run, and only the legacy
// demo fixture SKUs (correctly seeded DISCONTINUED by seed-integrated-review.ts above) remain.
run(
  "3/5 restore canonical product catalog (Seera 9-item + MUV import)",
  path.join(root, "scripts", "seera", "seed-product-catalog.ts"),
);
// Founder UAT fix: the same TRUNCATE also empties SeeraPriceVersion, so S.S. "Order from Company"
// and Distributor "Order from S.S." silently showed real, approved products as "Price not
// configured yet" after any guarded integration run — root-caused to this exact gap (the SKU
// catalog was already being restored above, but never the governed prices feeding off it). Order
// matters: the S.S.->Distributor markup-policy SKUs (Powder/Bartan) read the live COMPANY_TO_SS
// rate at seed time, so Company->S.S. must be restored first.
run(
  "4/5 restore Company -> Super Stockist governed price list",
  path.join(root, "scripts", "seera", "seed-company-to-ss-price-list.ts"),
);
run(
  "5/5 restore Super Stockist -> Distributor governed price list",
  path.join(root, "scripts", "seera", "seed-ss-to-distributor-price-list.ts"),
);

console.log(
  "\n[RESTORE REVIEW USERS] Done. All review-*@seera.test accounts exist, are ACTIVE, " +
    "use the fixed TEST password, and have a correct active role assignment.\n" +
    "Run `npm run verify:seera:review-users` (with the dev server running) to confirm live login + portal landing.",
);
