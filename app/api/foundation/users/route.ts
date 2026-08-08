import { NextResponse } from "next/server";
import { prisma } from "@/lib/database/client";
import { authorize } from "@/lib/foundation/authorization-service";
import { resolveRequestIdentity } from "@/lib/foundation/request-auth";
export async function GET() { try { const { user } = await resolveRequestIdentity(); await authorize(prisma, { actorId: user.id, permission: "user:view" }); const users = await prisma.user.findMany({ select: { id: true, email: true, name: true, status: true, createdAt: true }, take: 100, orderBy: { createdAt: "desc" } }); return NextResponse.json({ users }); } catch { return NextResponse.json({ error: { code: "ACCESS_DENIED" } }, { status: 403 }); } }
