import { afterAll,beforeAll,describe,expect,it } from "vitest";
import { login,resolveSession,revokeAllSessions,revokeSession } from "@/lib/foundation/auth-service";
import { bootstrapFounder,bootstrapFounderFromEnvironment } from "@/lib/foundation/bootstrap-service";
import { effectivePermissions } from "@/lib/foundation/authorization-service";
import { expectCode,founderEmail,founderPassword,prisma,setup } from "./test-context";
let founderId="";
beforeAll(async()=>{await setup();founderId=(await prisma.user.findUniqueOrThrow({where:{normalizedEmail:founderEmail}})).id;});afterAll(()=>prisma.$disconnect());
describe("authentication",()=>{
 it("valid login resolves an authoritative session",async()=>{const s=await login(prisma,{email:founderEmail,password:founderPassword});expect((await resolveSession(prisma,s.token)).user.id).toBe(founderId);});
 it("rejects invalid, nonexistent, and malformed credentials",async()=>{await expectCode(()=>login(prisma,{email:founderEmail,password:"WrongPassword!123"}),"INVALID_CREDENTIALS");await expectCode(()=>login(prisma,{email:"missing@example.test",password:"WrongPassword!123"}),"INVALID_CREDENTIALS");await expectCode(()=>login(prisma,{email:"bad",password:"x"}),"INVALID_AUTH_PAYLOAD");});
 it("rejects inactive, suspended, and disabled users",async()=>{for(const status of ["INACTIVE","SUSPENDED","DISABLED"] as const){const email=`${status.toLowerCase()}@example.test`,user=await prisma.user.create({data:{email,normalizedEmail:email,status,passwordHash:(await prisma.user.findUniqueOrThrow({where:{id:founderId}})).passwordHash}});await expectCode(()=>login(prisma,{email,password:founderPassword}),"USER_ACCESS_DISABLED");await prisma.user.delete({where:{id:user.id}});}});
 it("logout and explicit revoke invalidate sessions",async()=>{for(const reason of ["LOGOUT","EXPLICIT"]){const s=await login(prisma,{email:founderEmail,password:founderPassword});await revokeSession(prisma,s.sessionId,founderId,reason);await expectCode(()=>resolveSession(prisma,s.token),"SESSION_INVALID");}});
 it("revoke-all invalidates every session",async()=>{const a=await login(prisma,{email:founderEmail,password:founderPassword}),b=await login(prisma,{email:founderEmail,password:founderPassword});await revokeAllSessions(prisma,founderId,founderId,"ALL");await expectCode(()=>resolveSession(prisma,a.token),"SESSION_INVALID");await expectCode(()=>resolveSession(prisma,b.token),"SESSION_INVALID");});
});
describe("Founder bootstrap",()=>{
 it("created one Founder role and audit",async()=>{expect(await prisma.user.count({where:{normalizedEmail:founderEmail}})).toBe(1);expect((await effectivePermissions(prisma,founderId)).has("system:super_admin")).toBe(true);expect(await prisma.auditLog.count({where:{action:"founder.bootstrap"}})).toBe(1);});
 it("is idempotent without duplicate user or assignment",async()=>{expect((await bootstrapFounder(prisma,{email:founderEmail,password:founderPassword,name:"Founder"})).created).toBe(false);expect(await prisma.user.count({where:{normalizedEmail:founderEmail}})).toBe(1);});
 it("fails closed for missing/malformed inputs",async()=>{await expectCode(()=>bootstrapFounder(prisma,{email:"bad"}),"INVALID_BOOTSTRAP_INPUT");});
 it("rejects production-target bootstrap",async()=>{await expectCode(()=>bootstrapFounderFromEnvironment(prisma,{SEERA_DATABASE_ROLE:"production",SEERA_FOUNDER_EMAIL:founderEmail,SEERA_FOUNDER_PASSWORD:founderPassword}),"BOOTSTRAP_TARGET_REJECTED");});
});
