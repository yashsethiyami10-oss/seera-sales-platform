import { defineConfig } from "vitest/config"; import path from "path";
export default defineConfig({test:{environment:"node",include:["__tests__/seera-phase-6-9-integration/**/*.test.ts"],fileParallelism:false,testTimeout:120000,hookTimeout:240000},resolve:{alias:{"@":path.resolve(__dirname,".")}}});
