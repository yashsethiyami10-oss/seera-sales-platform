import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { authorizeDatabaseCommand } from "../../lib/database/identity-guard";
function envFile(file:string){const values:Record<string,string>={};for(const line of readFileSync(file,"utf8").split(/\r?\n/)){const match=/^\s*([^#][^=]*?)\s*=\s*(.*?)\s*$/.exec(line);if(match)values[match[1]]=match[2].replace(/^['"]|['"]$/g,"");}return values;}
const root=path.resolve(import.meta.dirname,"..","..");const production=envFile(path.join(root,".env")).DATABASE_URL;const test=envFile(path.join(root,".env.test")).TEST_DATABASE_URL;
const target=authorizeDatabaseCommand({intendedRole:"test",write:true,targetUrl:test,productionUrl:production,testUrl:test});const runtime=new URL(test);runtime.searchParams.set("connection_limit","2");runtime.searchParams.set("pool_timeout","60");
console.log(`[SEERA DB GUARD] role=${target.role} host=${target.host} database=${target.database} fingerprint=${target.fingerprint}`);
const cli=path.join(root,"node_modules","vitest","vitest.mjs");const result=spawnSync(process.execPath,[cli,"run","--config","vitest.phase2-5.integration.config.ts"],{cwd:root,env:{...process.env,DATABASE_URL:runtime.toString(),TEST_DATABASE_URL:test,SEERA_DATABASE_ROLE:"test"},stdio:"inherit"});if(result.error)throw result.error;
// This suite TRUNCATEs the whole users/roles table — always restore the permanent review-*@seera.test fixtures afterward.
const restore=spawnSync(process.execPath,[path.join(root,"node_modules","tsx","dist","cli.mjs"),path.join(root,"scripts","seera","restore-review-users.ts")],{cwd:root,stdio:"inherit"});if(restore.status!==0)console.error("[SEERA] WARNING: post-suite review-user restore failed — run `npm run seed:seera:review-users` manually.");
process.exit(result.status??1);
