import { defineConfig } from "vitest/config"; import path from "path";
export default defineConfig({test:{environment:"node",include:["__tests__/seera-block3/**/*.test.ts"],setupFiles:[],fileParallelism:false,maxWorkers:1,minWorkers:1,hookTimeout:60000,testTimeout:30000,sequence:{concurrent:false}},resolve:{alias:{"@":path.resolve(__dirname,".")}}});
