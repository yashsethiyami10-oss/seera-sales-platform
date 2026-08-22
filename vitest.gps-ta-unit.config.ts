import { defineConfig } from "vitest/config";
import path from "path";

// Mock-only GPS/TA lifecycle tests: no database client is used by this file.
export default defineConfig({
  test: {
    environment: "node",
    include: ["__tests__/seera-phase-6-9/gps-ta-final-lifecycle.test.ts"],
    fileParallelism: false,
  },
  resolve: { alias: { "@": path.resolve(__dirname, ".") } },
});
