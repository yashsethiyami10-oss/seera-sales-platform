import { defineConfig } from "vitest/config";
import path from "path";
export default defineConfig({ test: { environment: "node", include: ["__tests__/seera-localization/**/*.test.ts"], fileParallelism: false }, resolve: { alias: { "@": path.resolve(__dirname, ".") } } });
