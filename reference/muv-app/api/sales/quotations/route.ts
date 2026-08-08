import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { listQuotations } from "@/lib/quotation/repository";
import { createQuotation } from "@/lib/quotation/workflow";
import { requireAnyPermission, requirePermission } from "@/lib/sales/authorization";
import { PERMISSIONS } from "@/lib/sales/constants";
import { statusForError, toErrorResponse } from "@/lib/errors";
export async function GET(request: NextRequest) {
  try {
    await requireAnyPermission(PERMISSIONS.QUOTATIONS_VIEW_ALL, PERMISSIONS.QUOTATIONS_VIEW_ASSIGNED, PERMISSIONS.QUOTATIONS_VIEW_SUPPORT);
    const q=request.nextUrl.searchParams;
    return NextResponse.json({success:true,data:await listQuotations({q:q.get("q")??undefined,page:Number(q.get("page")??1),
      status:q.get("status")??undefined,approvalState:q.get("approval")??undefined,pricingPolicy:q.get("policy")??undefined,
      owner:q.get("owner")??undefined,territory:q.get("territory")??undefined,customerType:q.get("customerType")??undefined,sort:q.get("sort")??undefined})});
  } catch(error){return NextResponse.json(toErrorResponse(error),{status:statusForError(error)});}
}
export async function POST(request: NextRequest) {
  try {
    const actor=await requirePermission(PERMISSIONS.QUOTATIONS_CREATE_VERSIONS);
    const body=z.object({opportunityId:z.string().cuid(),pricingPolicyCode:z.string(),validUntil:z.coerce.date(),terms:z.record(z.string()).optional(),
      lines:z.array(z.object({productId:z.string().cuid(),variantId:z.string().cuid().nullish(),quantity:z.number().int().positive(),unitPrice:z.number().nonnegative().optional(),
        discountType:z.enum(["PERCENTAGE","FIXED"]).optional(),discountValue:z.number().nonnegative().optional(),discountReason:z.string().optional(),taxCode:z.string().optional(),displayOrder:z.number().int().optional()})).min(1)}).parse(await request.json());
    const result=await createQuotation(actor,body); return NextResponse.json({success:true,data:result},{status:201});
  } catch(error){return NextResponse.json(toErrorResponse(error),{status:statusForError(error)});}
}
