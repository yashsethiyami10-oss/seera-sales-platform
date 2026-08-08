import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  test: { environment: "node", include: ["__tests__/seera-phase-6-9/**/*.test.ts"], fileParallelism: false },
  resolve: { alias: { "@": path.resolve(__dirname, ".") } },
});
