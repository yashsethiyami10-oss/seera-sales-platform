import { randomBytes } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { expect } from "vitest";
import { hashPassword } from "@/lib/foundation/auth-service";
import { bootstrapFounder } from "@/lib/foundation/bootstrap-service";
import { PHASE_1_ROLES } from "@/lib/foundation/rbac-catalog";
import { seedFoundation } from "@/lib/foundation/seed-service";
import { readFileSync } from "node:fs";
import path from "node:path";
import { authorizeTestRuntime } from "@/lib/database/test-runtime-guard";
function envFile(file:string){const values:Record<string,string>={};for(const line of readFileSync(file,"utf8").split(/\r?\n/)){const match=/^\s*([^#][^=]*?)\s*=\s*(.*?)\s*$/.exec(line);if(match)values[match[1]]=match[2].replace(/^['"]|['"]$/g,"");}return values;}
const root=path.resolve(__dirname,"..","..");const configuredProduction=envFile(path.join(root,".env")).DATABASE_URL;const configuredTest=envFile(path.join(root,".env.test")).TEST_DATABASE_URL;
authorizeTestRuntime({runtimeRole:process.env.SEERA_DATABASE_ROLE,runtimeDatabaseUrl:process.env.DATABASE_URL,configuredProductionUrl:configuredProduction,configuredTestUrl:configuredTest});
export const prisma = new PrismaClient();
export const password = () => `Aa1!${randomBytes(18).toString("base64url")}`;
export const founderPassword=password(); export const founderEmail=`founder-${randomBytes(5).toString("hex")}@example.test`;
export let founderId=""; export const roleUsers=new Map<string,{id:string;password:string;email:string}>();
export async function setup(){await prisma.$executeRawUnsafe('TRUNCATE TABLE "notification_deliveries", "notifications", "stored_files", "outbox_events", "idempotency_keys", "app_settings", "feature_flags", "audit_logs", "user_role_assignments", "role_permissions", "permissions", "roles", "auth_verification_tokens", "auth_sessions", "auth_accounts", "users" CASCADE');await seedFoundation(prisma);founderId=(await bootstrapFounder(prisma,{email:founderEmail,password:founderPassword,name:"Test Founder"})).userId;const definitions=await Promise.all(PHASE_1_ROLES.filter(([code])=>code!=="FOUNDER_SUPER_ADMIN").map(async([code])=>{const pwd=password(),email=`${code.toLowerCase()}-${randomBytes(3).toString("hex")}@example.test`;return{code,pwd,email,passwordHash:await hashPassword(pwd)}}));await prisma.user.createMany({data:definitions.map(item=>({email:item.email,normalizedEmail:item.email,name:item.code,passwordHash:item.passwordHash}))});const users=await prisma.user.findMany({where:{normalizedEmail:{in:definitions.map(item=>item.email)}}}),roles=await prisma.role.findMany();const userIds=new Map(users.map(user=>[user.normalizedEmail,user.id])),roleIds=new Map(roles.map(role=>[role.code,role.id]));await prisma.userRoleAssignment.createMany({data:definitions.map(item=>({userId:userIds.get(item.email)!,roleId:roleIds.get(item.code)!,assignedById:founderId}))});for(const item of definitions)roleUsers.set(item.code,{id:userIds.get(item.email)!,password:item.pwd,email:item.email});}
export async function expectCode(run:()=>Promise<unknown>,code:string){await expect(run()).rejects.toMatchObject({code});}
