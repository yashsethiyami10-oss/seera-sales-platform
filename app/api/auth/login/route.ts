import { NextResponse } from "next/server";
import { prisma } from "@/lib/database/client";
import { login } from "@/lib/foundation/auth-service";
import { FoundationError } from "@/lib/foundation/errors";
import { SEERA_SESSION_COOKIE } from "@/lib/foundation/request-auth";
import { enforceRateLimit } from "@/lib/foundation/rate-limit";
import { apiFailure } from "@/lib/foundation/api-response";
import { portalLandingPathForRole } from "@/lib/foundation/portal-landing";
// P0 fix (Founder UAT): landing portal now derives from the same "primary role" concept the header
// badge uses (app/portal/[portal]/layout.tsx: the OLDEST active UserRoleAssignment) instead of
// scanning the unioned permission set in a hardcoded portal-precedence order — see
// lib/foundation/portal-landing.ts for the full reasoning.
export async function POST(request: Request) { try { const ip=(request.headers.get("x-forwarded-for")?.split(",")[0]??"unknown").trim();enforceRateLimit(`login:${ip}`,5,300_000); const result = await login(prisma, await request.json()); const primaryAssignment=await prisma.userRoleAssignment.findFirst({where:{userId:result.userId,status:"ACTIVE"},include:{role:true},orderBy:{assignedAt:"asc"}}); const landingPath=portalLandingPathForRole(primaryAssignment?.role.code);const response = NextResponse.json({ userId: result.userId,landingPath },{headers:{"Cache-Control":"no-store"}}); response.cookies.set(SEERA_SESSION_COOKIE, result.token, { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "strict", path: "/", expires: result.expires }); return response; } catch (error) { return apiFailure(error,request); } }
