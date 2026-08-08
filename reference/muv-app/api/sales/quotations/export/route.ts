import { NextRequest,NextResponse } from "next/server";
import { listQuotations } from "@/lib/quotation/repository";
import { requirePermission } from "@/lib/sales/authorization";
import { PERMISSIONS } from "@/lib/sales/constants";
import { prisma } from "@/lib/prisma";
import { statusForError,toErrorResponse } from "@/lib/errors";
const csv=(v:unknown)=>`"${String(v??"").replaceAll("\"","\"\"")}"`;
export async function GET(request:NextRequest){try{const actor=await requirePermission(PERMISSIONS.QUOTATIONS_EXPORT);const q=request.nextUrl.searchParams;
  const result=await listQuotations({q:q.get("q")??undefined,status:q.get("status")??undefined,pricingPolicy:q.get("policy")??undefined,pageSize:100});
  const rows=result.items.map(row=>{const v=row.versions[0];return [row.quotationNumber,row.customer.businessName??row.customer.name,row.opportunity.opportunityNumber,row.owner.name,v?.versionNumber,v?.status.name,v?.pricingPolicy.name,v?.grandTotal,v?.validUntil.toISOString()].map(csv).join(",")});
  await prisma.salesAuditLog.create({data:{userId:actor.id,module:"quotations",action:"QUOTATION_EXPORT",recordType:"Quotation",newValue:{count:rows.length}}});
  return new NextResponse([["Quotation","Customer","Opportunity","Owner","Version","Status","Policy","Total","Valid Until"].map(csv).join(","),...rows].join("\r\n"),{headers:{"content-type":"text/csv","content-disposition":"attachment; filename=quotations.csv"}});
}catch(error){return NextResponse.json(toErrorResponse(error),{status:statusForError(error)});}}
