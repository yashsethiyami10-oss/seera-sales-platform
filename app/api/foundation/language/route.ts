import { NextResponse } from "next/server";
import { prisma } from "@/lib/database/client";
import { resolveRequestIdentity } from "@/lib/foundation/request-auth";
import { apiFailure } from "@/lib/foundation/api-response";
import { FoundationError } from "@/lib/foundation/errors";
import { recordAudit } from "@/lib/foundation/audit-service";

export async function GET(request: Request) { try { const { user } = await resolveRequestIdentity(); return NextResponse.json({ language: user.preferredLanguage }, { headers: { "Cache-Control": "private, no-store" } }); } catch (error) { return apiFailure(error, request); } }
export async function PATCH(request: Request) { try { const { user } = await resolveRequestIdentity(); const body = await request.json() as { language?: unknown }; if (body.language !== "EN" && body.language !== "HI") throw new FoundationError("VALIDATION_ERROR", "Unsupported language", 400); const language = body.language; const updated = await prisma.$transaction(async (tx) => { const result = await tx.user.update({ where: { id: user.id }, data: { preferredLanguage: language }, select: { preferredLanguage: true } }); await recordAudit(tx, { actorId: user.id, action: "user.language.updated", entityType: "User", entityId: user.id, details: { preferredLanguage: language } }); return result; }); return NextResponse.json({ language: updated.preferredLanguage }, { headers: { "Cache-Control": "private, no-store" } }); } catch (error) { return apiFailure(error, request); } }
