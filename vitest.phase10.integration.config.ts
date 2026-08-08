import {defineConfig} from "vitest/config";import path from "node:path";
export default defineConfig({test:{environment:"node",include:["__tests__/seera-phase-10-integration/**/*.test.ts"],reporters:["verbose"],fileParallelism:false,maxWorkers:1,minWorkers:1,testTimeout:120000,hookTimeout:240000,sequence:{concurrent:false}},resolve:{alias:{"@":path.resolve(__dirname,".")}}});
