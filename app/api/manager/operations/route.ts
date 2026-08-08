import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/database/client";
import { apiFailure } from "@/lib/foundation/api-response";
import { resolveRequestIdentity } from "@/lib/foundation/request-auth";
import { closeJointWorking, createDistributorProspect, managerDailyWorking, managerRetailerCheckIn, managerRetailerCheckOut, managerTeamReadModel, startJointWorking } from "@/lib/sales-distribution/manager-service";
import { assistedDistributorOperation, endFieldDay, startFieldDay } from "@/lib/sales-distribution/workflow-service";

const requestBody = z.object({ action: z.enum(["start-day","end-day","retailer-check-in","retailer-check-out","daily-working","create-distributor-prospect","team-dashboard","start-joint","close-joint","assisted-distributor"]), payload: z.record(z.unknown()).default({}) });
export async function POST(request: Request) { try { const { user } = await resolveRequestIdentity(); const { action, payload } = requestBody.parse(await request.json()); let result;
  if(action==="start-day") result=await startFieldDay(prisma,user.id,{employeeRole:"SALES_MANAGER",...z.object({workingType:z.enum(["RETAILING","MARKET_WORKING","JOINT_WORKING"]),plannedGeographyId:z.string().optional(),latitude:z.number().optional(),longitude:z.number().optional(),remarks:z.string().optional()}).parse(payload)});
  else if(action==="end-day"){const v=z.object({sessionId:z.string(),latitude:z.number().optional(),longitude:z.number().optional(),remarks:z.string().optional(),outcome:z.string()}).parse(payload);result=await endFieldDay(prisma,user.id,v.sessionId,v);}
  else if(action==="retailer-check-in") result=await managerRetailerCheckIn(prisma,user.id,z.object({workSessionId:z.string(),retailerId:z.string(),latitude:z.number().optional(),longitude:z.number().optional(),idempotencyKey:z.string()}).parse(payload));
  else if(action==="retailer-check-out"){const v=z.object({visitId:z.string(),outcome:z.enum(["ORDER_BOOKED","NO_ORDER","FOLLOW_UP","COLLECTION","MARKET_INTELLIGENCE"]),noOrderReason:z.string().optional(),notes:z.string().optional()}).parse(payload);result=await managerRetailerCheckOut(prisma,user.id,v.visitId,v);}
  else if(action==="daily-working") result=await managerDailyWorking(prisma,user.id,z.object({sessionId:z.string()}).parse(payload).sessionId);
  else if(action==="create-distributor-prospect") result=await createDistributorProspect(prisma,user.id,z.object({businessName:z.string(),mobile:z.string(),areaId:z.string().optional(),profile:z.record(z.unknown()),followUpAt:z.coerce.date().optional()}).parse(payload));
  else if(action==="team-dashboard") result=await managerTeamReadModel(prisma,user.id);
  else if(action==="start-joint") result=await startJointWorking(prisma,user.id,z.object({salesExecutiveId:z.string(),territoryId:z.string().optional(),beatId:z.string().optional()}).parse(payload));
  else if(action==="close-joint"){const v=z.object({jointWorkId:z.string(),visitId:z.string(),orderId:z.string().optional(),observations:z.string(),coaching:z.string()}).parse(payload);result=await closeJointWorking(prisma,user.id,v.jointWorkId,v);}
  else result=await assistedDistributorOperation(prisma,user.id,z.object({distributorId:z.string(),reason:z.string(),idempotencyKey:z.string(),subtotal:z.number().nonnegative()}).parse(payload));
  return NextResponse.json(result); } catch(error){return apiFailure(error,request);} }
