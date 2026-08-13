import { defineConfig } from "vitest/config";
import path from "path";

/**
 * MUV AI Website Integration — Wave 2. This project had no established
 * test framework (see CLAUDE.md's own "There is no test runner configured
 * in package.json" note) — Vitest is the minimal, TS-native choice added
 * here to satisfy Wave 2's explicit automated-testing requirement.
 * `node` environment only (no jsdom/browser dependency) — every test in
 * this pass exercises server-side logic (actions, RBAC boundaries,
 * validation) directly, not rendered React components; see
 * known-limitations for what that does and doesn't cover.
 */
export default defineConfig({
  test: {
    environment: "node",
    include: ["__tests__/**/*.test.ts"],
    // These folders TRUNCATE the entire users/roles/permissions table CASCADE
    // as part of their own "bootstrap from an empty DB" fixture setup
    // (see __tests__/seera-block3/test-context.ts and the analogous
    // phaseN-integration suites) and each already has its own dedicated,
    // DB-identity-guarded npm command (test:seera:block3, test:seera:phase2-5
    // :integration, :phase6-9:integration, :phase10:integration, :phase11
    // :integration). Without this exclude, a plain `npm test` silently
    // re-runs them too and wipes every user in the shared TEST database —
    // including the permanent review-*@seera.test fixtures — which was the
    // confirmed root cause of review credentials repeatedly going missing
    // between sessions. Run those suites only via their dedicated commands.
    exclude: [
      "**/node_modules/**",
      "__tests__/seera-block3/**",
      "__tests__/seera-phase-2-5-integration/**",
      "__tests__/seera-phase-6-9-integration/**",
      "__tests__/seera-phase-10-integration/**",
      "__tests__/seera-phase-11-integration/**",
    ],
    setupFiles: ["./__tests__/muv-ai/test-setup.ts"],
    // Integration tests across this suite share one live database and,
    // starting with Part 3C, mutate global org-scoped singleton rows
    // (AiConfiguration feature flags) mid-test rather than only reading
    // them. Running test files in parallel let two files race on the same
    // flag row (one file's temporary `false` observed by another file's
    // otherwise-passing assertion) — sequential file execution removes
    // that race. Tests within a single file still share Vitest's normal
    // in-file ordering.
    fileParallelism: false,
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "."),
    },
  },
});
