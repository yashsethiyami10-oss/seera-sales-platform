import { defineConfig } from "vitest/config";
import path from "path";
export default defineConfig({ test: { environment: "node", include: ["__tests__/seera-phase-2-5-integration/**/*.test.ts"], fileParallelism: false, maxWorkers: 1, minWorkers: 1, hookTimeout: 240000, testTimeout: 90000, sequence: { concurrent: false } }, resolve: { alias: { "@": path.resolve(__dirname, ".") } } });
