import { defineConfig } from "vitest/config";
import path from "node:path";
export default defineConfig({
  resolve: { alias: { "@": path.resolve(__dirname, ".") } },
  test: { environment: "node", include: ["__tests__/seera-end-day-forced-failure/**/*.test.ts"], fileParallelism: false },
});
