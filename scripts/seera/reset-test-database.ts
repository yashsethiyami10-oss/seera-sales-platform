import { spawnSync } from "node:child_process";
import path from "node:path";

if (process.env.SEERA_CONFIRM_TEST_DB_RESET !== "RESET_SEERA_TEST_DATABASE") {
  throw new Error("Destructive reset denied. Set SEERA_CONFIRM_TEST_DB_RESET=RESET_SEERA_TEST_DATABASE explicitly.");
}

const wrapper = path.resolve(import.meta.dirname, "guarded-prisma.ts");
const tsx = path.resolve(import.meta.dirname, "..", "..", "node_modules", "tsx", "dist", "cli.mjs");
const result = spawnSync(process.execPath, [tsx, wrapper, "--", "migrate", "reset", "--force", "--skip-seed"], {
  stdio: "inherit",
});
if (result.error) throw result.error;
process.exit(result.status ?? 1);
