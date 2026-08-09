import {readFileSync} from "node:fs";import path from "node:path";import {PrismaClient} from "@prisma/client";import {inspectDatabaseUrl,validateDatabaseIsolation} from "../../lib/database/identity-guard";
function envFile(file:string){const out:Record<string,string>={};for(const line of readFileSync(file,"utf8").split(/\r?\n/)){const m=/^\s*([^#][^=]*?)\s*=\s*(.*?)\s*$/.exec(line);if(m)out[m[1]]=m[2].replace(/^['"]|['"]$/g,"");}return out;}
const root=path.resolve(import.meta.dirname,"..",".."),production=envFile(path.join(root,".env")).DATABASE_URL,testEnv=envFile(path.join(root,".env.test")),pooled=testEnv.TEST_DATABASE_URL,direct=testEnv.TEST_DIRECT_DATABASE_URL;
if(!direct?.trim())throw new Error("TEST_DIRECT_DATABASE_URL_MISSING");
const isolated=validateDatabaseIsolation({productionUrl:production,testUrl:pooled}),directIdentity=inspectDatabaseUrl(direct,"test");
if(directIdentity.host.includes("-pooler"))throw new Error("DIRECT_ENDPOINT_IS_POOLED");
if(directIdentity.projectIdentifier!==isolated.test.projectIdentifier||directIdentity.database!==isolated.test.database)throw new Error("DIRECT_ENDPOINT_NOT_SAME_TEST_ENVIRONMENT");
if(directIdentity.projectIdentifier===isolated.production.projectIdentifier&&directIdentity.database===isolated.production.database)throw new Error("DIRECT_ENDPOINT_POINTS_TO_PRODUCTION");
const db=new PrismaClient({datasources:{db:{url:direct}}});
async function main(){const started=Date.now(),oneAt=Date.now();await db.$queryRaw`SELECT 1`;const oneMs=Date.now()-oneAt,nowAt=Date.now();await db.$queryRaw`SELECT now()`;const nowMs=Date.now()-nowAt;console.log(JSON.stringify({variableExists:true,directUnpooled:true,sameTestProject:true,sameTestDatabase:true,notProduction:true,notKnownMuv:true,noFallback:true,pooledFingerprint:isolated.test.fingerprint,directFingerprint:directIdentity.fingerprint,select1:{status:"PASS",ms:oneMs},selectNow:{status:"PASS",ms:nowMs},totalMs:Date.now()-started}));}
main().finally(async()=>{const at=Date.now();await db.$disconnect();console.log(JSON.stringify({disconnectMs:Date.now()-at}));});
