import { redirect } from "next/navigation";
import { resolveRequestIdentity } from "@/lib/foundation/request-auth";
import { portalLandingPathForRole, primaryRoleAssignment } from "@/lib/foundation/portal-landing";
import { prisma } from "@/lib/database/client";
export default async function Home(){let user;try{({user}=await resolveRequestIdentity())}catch{redirect("/login")}const primary=await primaryRoleAssignment(prisma,user.id);redirect(portalLandingPathForRole(primary?.role.code))}
