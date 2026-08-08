import { NextResponse } from "next/server";
import { prisma } from "@/lib/database/client";
import { login } from "@/lib/foundation/auth-service";
import { FoundationError } from "@/lib/foundation/errors";
import { SEERA_SESSION_COOKIE } from "@/lib/foundation/request-auth";
export async function POST(request: Request) { try { const result = await login(prisma, await request.json()); const response = NextResponse.json({ userId: result.userId }); response.cookies.set(SEERA_SESSION_COOKIE, result.token, { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", expires: result.expires }); return response; } catch (error) { const status = error instanceof FoundationError ? error.status : 400; return NextResponse.json({ error: { code: error instanceof FoundationError ? error.code : "LOGIN_FAILED", message: "Sign-in failed" } }, { status }); } }
