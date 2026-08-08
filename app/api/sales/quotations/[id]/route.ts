import { NextResponse } from "next/server";
import { getQuotation } from "@/lib/quotation/repository";
import { requireAnyPermission } from "@/lib/sales/authorization";
import { PERMISSIONS } from "@/lib/sales/constants";
import { NotFoundError,statusForError,toErrorResponse } from "@/lib/errors";
export async function GET(_request:Request,{params}:{params:Promise<{id:string}>}){
  try{await requireAnyPermission(PERMISSIONS.QUOTATIONS_VIEW_ALL,PERMISSIONS.QUOTATIONS_VIEW_ASSIGNED,PERMISSIONS.QUOTATIONS_VIEW_SUPPORT);
    const row=await getQuotation((await params).id);if(!row)throw new NotFoundError("Quotation");return NextResponse.json({success:true,data:row});
  }catch(error){return NextResponse.json(toErrorResponse(error),{status:statusForError(error)});}
}
