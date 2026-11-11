import { defineConfig } from "vitest/config";
import path from "node:path";

// Field / partner usability pass: pure-logic + static-contract tests (always), plus a DB-backed
// scope suite that only runs when SEERA_USABILITY_DB_URL points at a disposable TEST database.
export default defineConfig({
  resolve: { alias: { "@": path.resolve(__dirname, ".") } },
  test: { environment: "node", include: ["__tests__/seera-usability/**/*.test.ts"], fileParallelism: false },
});
