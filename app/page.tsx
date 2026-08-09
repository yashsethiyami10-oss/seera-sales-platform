import { redirect } from "next/navigation";
import { resolveRequestIdentity } from "@/lib/foundation/request-auth";
import { effectivePermissions } from "@/lib/foundation/authorization-service";
import { portalLandingPath } from "@/lib/foundation/portal-landing";
import { prisma } from "@/lib/database/client";
export default async function Home(){let user;try{({user}=await resolveRequestIdentity())}catch{redirect("/login")}redirect(portalLandingPath(await effectivePermissions(prisma,user.id)))}
