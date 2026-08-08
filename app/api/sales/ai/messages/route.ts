import { NextRequest, NextResponse } from "next/server";
import { getAiPrincipal } from "@/lib/muv-ai/authorization";
import { submitGovernedMessage } from "@/lib/muv-ai/orchestrator";
import { requireAiPermission } from "@/lib/muv-ai/security";
import { statusForError, toErrorResponse } from "@/lib/errors";
export async function POST(request:NextRequest){try{const p=await getAiPrincipal();requireAiPermission(p,"ai.conversations.use");const b=await request.json();return NextResponse.json(await submitGovernedMessage(p,String(b.conversationId),String(b.message),{module:b.module,selectedRecordIds:b.selectedRecordIds}));}catch(error){return NextResponse.json(toErrorResponse(error),{status:statusForError(error)});}}
