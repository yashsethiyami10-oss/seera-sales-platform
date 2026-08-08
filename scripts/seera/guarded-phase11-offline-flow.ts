import {spawn} from "node:child_process";
import {readFileSync} from "node:fs";
import path from "node:path";
import {PrismaClient} from "@prisma/client";
import {authorizeDatabaseCommand} from "../../lib/database/identity-guard";

function envFile(file:string){const out:Record<string,string>={};for(const line of readFileSync(file,"utf8").split(/\r?\n/)){const m=/^\s*([^#][^=]*?)\s*=\s*(.*?)\s*$/.exec(line);if(m)out[m[1]]=m[2].replace(/^['"]|['"]$/g,"");}return out;}
const flow=process.argv[2];
if(flow!=="4"&&flow!=="6")throw new Error("Expected exactly one flow: 4 or 6");
const root=path.resolve(import.meta.dirname,"..","..");
const production=envFile(path.join(root,".env")).DATABASE_URL;
const test=envFile(path.join(root,".env.test")).TEST_DATABASE_URL;
const target=authorizeDatabaseCommand({intendedRole:"test",write:true,targetUrl:test,productionUrl:production,testUrl:test});
const runtime=new URL(test);runtime.searchParams.set("connection_limit","4");runtime.searchParams.set("pool_timeout","60");

async function preflight(attempt:number){const db=new PrismaClient({datasources:{db:{url:runtime.toString()}}}),started=Date.now();try{const oneAt=Date.now();await db.$queryRaw`SELECT 1`;const oneMs=Date.now()-oneAt;const nowAt=Date.now();await db.$queryRaw`SELECT now()`;const nowMs=Date.now()-nowAt;if(oneMs>15_000||nowMs>15_000)throw new Error(`PREFLIGHT_SLOW select1=${oneMs} selectNow=${nowMs}`);console.log(JSON.stringify({event:"preflight",attempt,status:"PASS",select1Ms:oneMs,selectNowMs:nowMs,totalMs:Date.now()-started,fingerprint:target.fingerprint}));return true;}catch(error){console.log(JSON.stringify({event:"preflight",attempt,status:"FAIL",durationMs:Date.now()-started,code:typeof error==="object"&&error&&"code" in error?String(error.code):null,message:error instanceof Error?error.message:"UNKNOWN"}));return false;}finally{const at=Date.now();await db.$disconnect();console.log(JSON.stringify({event:"preflight-disconnect",attempt,durationMs:Date.now()-at}));}}

async function main(){let healthy=await preflight(1);if(!healthy){await new Promise(resolve=>setTimeout(resolve,3_000));healthy=await preflight(2);}if(!healthy)process.exit(2);
 const cli=path.join(root,"node_modules","vitest","vitest.mjs"),started=Date.now();
 const child=spawn(process.execPath,[cli,"run","--config","vitest.phase11.offline-closure.config.ts"],{cwd:root,env:{...process.env,DATABASE_URL:runtime.toString(),TEST_DATABASE_URL:test,SEERA_DATABASE_ROLE:"test",SEERA_OFFLINE_CLOSURE_FLOW:flow},stdio:"inherit"});
 let bounded=false;const timer=setTimeout(()=>{bounded=true;child.kill("SIGTERM");},120_000);
 const result=await new Promise<{code:number|null;signal:NodeJS.Signals|null}>(resolve=>child.once("exit",(code,signal)=>resolve({code,signal})));
 clearTimeout(timer);console.log(JSON.stringify({event:"flow-process-exit",flow,code:result.code,signal:result.signal,bounded,durationMs:Date.now()-started}));
 process.exit(result.code===0&&!bounded?0:1);
}
main().catch(error=>{console.error(error);process.exit(1);});
