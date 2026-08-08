import { NextRequest, NextResponse } from "next/server";
import { getAiPrincipal } from "@/lib/muv-ai/authorization";
import { createConversation, listConversations } from "@/lib/muv-ai/conversations";
import { requireAiPermission } from "@/lib/muv-ai/security";
import { statusForError, toErrorResponse } from "@/lib/errors";

export async function GET(request: NextRequest) { try { const p=await getAiPrincipal();requireAiPermission(p,"ai.conversations.use");const q=request.nextUrl.searchParams;return NextResponse.json(await listConversations(p,{search:q.get("search")??undefined,status:q.get("status")??undefined,page:Number(q.get("page")??1),take:Number(q.get("take")??25)})); } catch(error){return NextResponse.json(toErrorResponse(error),{status:statusForError(error)});} }
export async function POST(request: NextRequest) { try { const p=await getAiPrincipal();requireAiPermission(p,"ai.conversations.use");const body=await request.json();return NextResponse.json(await createConversation(p,String(body.title??""),String(body.type??"GENERAL")),{status:201}); } catch(error){return NextResponse.json(toErrorResponse(error),{status:statusForError(error)});} }
