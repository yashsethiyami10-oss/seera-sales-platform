import { NextResponse } from "next/server";
import { prisma } from "@/lib/database/client";
import { authorize } from "@/lib/foundation/authorization-service";
import { resolveRequestIdentity } from "@/lib/foundation/request-auth";
import { createUser } from "@/lib/foundation/user-management-service"; import { apiFailure } from "@/lib/foundation/api-response"; import { enforceRateLimit } from "@/lib/foundation/rate-limit";
export async function GET(request:Request) { try { const { user } = await resolveRequestIdentity(); await authorize(prisma, { actorId: user.id, permission: "user:view" }); const users = await prisma.user.findMany({ select: { id: true, email: true, name: true, status: true, createdAt: true }, take: 100, orderBy: { createdAt: "desc" } }); return NextResponse.json({ users },{headers:{"Cache-Control":"private, no-store"}}); } catch(error) { return apiFailure(error,request); } }
export async function POST(request:Request){try{const{user}=await resolveRequestIdentity();enforceRateLimit(`admin-user:${user.id}`,20,60_000);const created=await createUser(prisma,user.id,await request.json());return NextResponse.json({user:{id:created.id,email:created.email,name:created.name,status:created.status}},{status:201});}catch(error){return apiFailure(error,request);}}
