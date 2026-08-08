import {defineConfig} from "vitest/config";
import path from "node:path";

export default defineConfig({
  test:{
    environment:"node",
    include:["__tests__/seera-phase-11-closure/offline-flow.test.ts"],
    reporters:["verbose"],
    fileParallelism:false,
    maxWorkers:1,
    minWorkers:1,
    pool:"forks",
    isolate:true,
    testTimeout:90_000,
    hookTimeout:120_000,
  },
  resolve:{alias:{"@":path.resolve(__dirname,".")}},
});
