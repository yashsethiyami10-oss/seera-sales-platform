import type { PrismaClient } from "@prisma/client";
import { PHASE_1_FEATURE_FLAGS, PHASE_1_PERMISSIONS, PHASE_1_ROLES, ROLE_PERMISSION_MATRIX } from "./rbac-catalog";

export async function seedFoundation(prisma: PrismaClient) {
  await prisma.permission.createMany({data:PHASE_1_PERMISSIONS.map(permission=>{const [resource,action]=permission.split(":") as [string,string];return{code:permission,resource,action};}),skipDuplicates:true});
  await prisma.role.createMany({data:PHASE_1_ROLES.map(([code,name])=>({code,name,isSystem:code==="FOUNDER_SUPER_ADMIN"})),skipDuplicates:true});
  const roles=await prisma.role.findMany({where:{code:{in:PHASE_1_ROLES.map(([code])=>code)}}}); const permissions=await prisma.permission.findMany({where:{code:{in:[...PHASE_1_PERMISSIONS]}}});
  const roleIds=new Map(roles.map(role=>[role.code,role.id])),permissionIds=new Map(permissions.map(permission=>[permission.code,permission.id]));
  await prisma.$transaction(async tx=>{await tx.rolePermission.deleteMany({where:{roleId:{in:[...roleIds.values()]}}});await tx.rolePermission.createMany({data:PHASE_1_ROLES.flatMap(([code])=>ROLE_PERMISSION_MATRIX[code].map(permission=>({roleId:roleIds.get(code)!,permissionId:permissionIds.get(permission)!}))),skipDuplicates:true});});
  await prisma.featureFlag.createMany({data:PHASE_1_FEATURE_FLAGS.map(key=>({key,enabled:true,description:"Phase 1 portal availability"})),skipDuplicates:true});
  await prisma.appSetting.upsert({ where: { key: "security.session.max_age_hours" }, update: {}, create: { key: "security.session.max_age_hours", category: "security", valueType: "NUMBER", value: 24 } });
  return { roles: PHASE_1_ROLES.length, permissions: PHASE_1_PERMISSIONS.length, featureFlags: PHASE_1_FEATURE_FLAGS.length };
}
