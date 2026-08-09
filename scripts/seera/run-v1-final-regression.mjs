import {spawnSync} from "node:child_process";import path from "node:path";import {fileURLToPath} from "node:url";
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..","..");
const vitest=path.join(root,"node_modules","vitest","vitest.mjs"),tsx=path.join(root,"node_modules","tsx","dist","cli.mjs");
const commands=[
  ["vitest.phase1-remediation.config.ts"],["vitest.phase2-5.config.ts"],["vitest.localization.config.ts"],["vitest.phase6-9.config.ts"],["vitest.phase10.config.ts"],["vitest.phase11.config.ts"],
].map(([config])=>[process.execPath,[vitest,"run","--config",config]]);
for(const script of ["guarded-phase2-5-vitest.ts","guarded-phase6-9-vitest.ts","guarded-phase10-vitest.ts","guarded-phase11-vitest.ts"])commands.push([process.execPath,[tsx,path.join(root,"scripts","seera",script)]]);
for(const [command,args] of commands){console.log(`\n[SEERA FINAL REGRESSION] ${path.basename(args.at(-1))}`);const result=spawnSync(command,args,{cwd:root,env:{...process.env},stdio:"inherit",shell:false});if(result.error)throw result.error;if(result.status!==0)process.exit(result.status??1);}
console.log("\n[SEERA FINAL REGRESSION] ALL CONFIGURED SUITES PASSED");
