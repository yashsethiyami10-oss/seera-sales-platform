import { NextResponse } from "next/server";
import { prisma } from "@/lib/database/client";
import { listNotifications } from "@/lib/foundation/notification-service";
import { resolveRequestIdentity } from "@/lib/foundation/request-auth";
import { markNotificationRead } from "@/lib/foundation/notification-service"; import { apiFailure } from "@/lib/foundation/api-response";
import { FoundationError } from "@/lib/foundation/errors";
export async function GET(request:Request) { try { const { user } = await resolveRequestIdentity(); const cursor=new URL(request.url).searchParams.get("cursor")??undefined;return NextResponse.json({ notifications: await listNotifications(prisma, user.id, user.id,cursor) },{headers:{"Cache-Control":"private, no-store"}}); } catch(error) { return apiFailure(error,request); } }
export async function PATCH(request:Request){try{const{user}=await resolveRequestIdentity();const body=await request.json() as {notificationId?:string};if(!body.notificationId)throw new FoundationError("VALIDATION_ERROR","Notification ID is required",400);return NextResponse.json({notification:await markNotificationRead(prisma,user.id,body.notificationId)});}catch(error){return apiFailure(error,request);}}
