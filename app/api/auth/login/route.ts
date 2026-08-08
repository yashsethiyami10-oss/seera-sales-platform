import { NextResponse } from "next/server";
import { prisma } from "@/lib/database/client";
import { login } from "@/lib/foundation/auth-service";
import { FoundationError } from "@/lib/foundation/errors";
import { SEERA_SESSION_COOKIE } from "@/lib/foundation/request-auth";
import { enforceRateLimit } from "@/lib/foundation/rate-limit";
import { apiFailure } from "@/lib/foundation/api-response";
import { effectivePermissions } from "@/lib/foundation/authorization-service";
import { portalLandingPath } from "@/lib/foundation/portal-landing";
export async function POST(request: Request) { try { const ip=(request.headers.get("x-forwarded-for")?.split(",")[0]??"unknown").trim();enforceRateLimit(`login:${ip}`,5,300_000); const result = await login(prisma, await request.json()); const landingPath=portalLandingPath(await effectivePermissions(prisma,result.userId));const response = NextResponse.json({ userId: result.userId,landingPath },{headers:{"Cache-Control":"no-store"}}); response.cookies.set(SEERA_SESSION_COOKIE, result.token, { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "strict", path: "/", expires: result.expires }); return response; } catch (error) { return apiFailure(error,request); } }
