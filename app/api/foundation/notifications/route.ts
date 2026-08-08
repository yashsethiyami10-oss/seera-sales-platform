import { NextResponse } from "next/server";
import { prisma } from "@/lib/database/client";
import { listNotifications } from "@/lib/foundation/notification-service";
import { resolveRequestIdentity } from "@/lib/foundation/request-auth";
export async function GET() { try { const { user } = await resolveRequestIdentity(); return NextResponse.json({ notifications: await listNotifications(prisma, user.id, user.id) }); } catch { return NextResponse.json({ error: { code: "ACCESS_DENIED" } }, { status: 403 }); } }
