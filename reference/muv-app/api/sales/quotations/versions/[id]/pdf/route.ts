import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/sales/authorization";
import { PERMISSIONS } from "@/lib/sales/constants";
import { quotationScope } from "@/lib/quotation/repository";
import { generateQuotationPdf } from "@/lib/quotation/pdf";
import { registerDocument } from "@/lib/quotation/workflow";
import { NotFoundError,statusForError,toErrorResponse } from "@/lib/errors";
export async function GET(_request:Request,{params}:{params:Promise<{id:string}>}){try{const actor=await requirePermission(PERMISSIONS.QUOTATIONS_PDF);
  const version=await prisma.quotationVersion.findFirst({where:{id:(await params).id,quotation:await quotationScope()},include:{quotation:{include:{customer:true,opportunity:true,owner:true}},lineItems:{orderBy:{displayOrder:"asc"}}}});
  if(!version)throw new NotFoundError("Quotation version");const terms=version.termsSnapshot&&typeof version.termsSnapshot==="object"&&!Array.isArray(version.termsSnapshot)?Object.entries(version.termsSnapshot).map(([k,v])=>`${k}: ${String(v)}`):[];
  const pdf=generateQuotationPdf({quotationNumber:version.quotation.quotationNumber,versionNumber:version.versionNumber,issueDate:version.issueDate,validUntil:version.validUntil,
    customer:version.quotation.customer.businessName??version.quotation.customer.name,opportunityNumber:version.quotation.opportunity.opportunityNumber,owner:version.quotation.owner.name??version.quotation.owner.email,
    subtotal:version.subtotal.toString(),discountTotal:version.discountTotal.toString(),taxTotal:version.taxTotal.toString(),grandTotal:version.grandTotal.toString(),
    lines:version.lineItems.map(l=>({productName:l.productName,sku:l.skuSnapshot??"",quantity:l.quantity,unitPrice:l.unitPrice.toString(),total:l.total.toString()})),terms});
  await registerDocument(actor,version.id,`quotation://${version.quotation.quotationNumber}/v${version.versionNumber}/${randomUUID()}.pdf`,pdf.length);
  return new NextResponse(new Uint8Array(pdf),{headers:{"content-type":"application/pdf","content-disposition":`attachment; filename=${version.quotation.quotationNumber}-v${version.versionNumber}.pdf`}});
}catch(error){return NextResponse.json(toErrorResponse(error),{status:statusForError(error)});}}
