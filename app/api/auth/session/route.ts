import { NextResponse } from "next/server";
import { resolveRequestIdentity } from "@/lib/foundation/request-auth";
export async function GET() { try { const { user, session } = await resolveRequestIdentity(); return NextResponse.json({ user: { id: user.id, email: user.email, name: user.name }, sessionId: session.id }); } catch { return NextResponse.json({ error: { code: "SESSION_INVALID" } }, { status: 401 }); } }
