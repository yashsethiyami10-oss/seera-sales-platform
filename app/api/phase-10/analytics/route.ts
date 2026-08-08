import { NextResponse } from "next/server";
import { prisma } from "@/lib/database/client";
import { resolveRequestIdentity } from "@/lib/foundation/request-auth";
import { authorize } from "@/lib/foundation/authorization-service";
import { apiFailure } from "@/lib/foundation/api-response";
import { SEERA_PORTALS } from "@/lib/foundation/portal-registry";
import { getDashboard } from "@/lib/phase-10/dashboard-service";
import type { AnalyticsPortal } from "@/lib/phase-10/scope";
import type { TimePreset } from "@/lib/phase-10/time-intelligence";
const portals=new Set(["founder-admin","company-admin","accounts","sales-manager","sales-executive","distributor","super-stockist"]);
const periods=new Set(["TODAY","YESTERDAY","THIS_WEEK","LAST_WEEK","THIS_MONTH","LAST_MONTH","QUARTER","YTD","FINANCIAL_YEAR"]);
export async function GET(request:Request){try{const{user}=await resolveRequestIdentity(),url=new URL(request.url),portal=url.searchParams.get("portal")??"";if(!portals.has(portal))return NextResponse.json({error:{code:"INVALID_PORTAL"}},{status:400});const definition=SEERA_PORTALS[portal as keyof typeof SEERA_PORTALS];await authorize(prisma,{actorId:user.id,permission:definition.requiredPermission,...(definition.featureFlag?{featureFlag:definition.featureFlag}:{})});const raw=url.searchParams.get("period")??"FINANCIAL_YEAR",period=(periods.has(raw)?raw:"FINANCIAL_YEAR") as TimePreset;return NextResponse.json(await getDashboard(prisma,user.id,portal as AnalyticsPortal,period),{headers:{"Cache-Control":"private, no-store"}});}catch(error){return apiFailure(error,request);}}
