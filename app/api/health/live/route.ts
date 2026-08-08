import { NextResponse } from "next/server";
export async function GET(){return NextResponse.json({status:"alive",app:"seera-sales-distribution-os"},{headers:{"Cache-Control":"no-store"}});}
