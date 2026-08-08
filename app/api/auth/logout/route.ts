import { NextResponse } from "next/server";
import { prisma } from "@/lib/database/client";
import { revokeSession } from "@/lib/foundation/auth-service";
import { resolveRequestIdentity, SEERA_SESSION_COOKIE } from "@/lib/foundation/request-auth";
export async function POST() { try { const { session, user } = await resolveRequestIdentity(); await revokeSession(prisma, session.id, user.id, "LOGOUT"); } catch {} const response = NextResponse.json({ success: true }); response.cookies.set(SEERA_SESSION_COOKIE, "", { httpOnly: true, expires: new Date(0), path: "/" }); return response; }
