import type {Prisma,PrismaClient} from "@prisma/client";import {FoundationError} from "@/lib/foundation/errors";import {recordAudit} from "@/lib/foundation/audit-service";import {offlineOperationSchema,type OfflineOperationInput} from "./offline-contract";import {classifyOfflineConflict} from "./conflict-engine";import {placeRetailerOrder,endFieldDay} from "@/lib/sales-distribution/workflow-service";import {recordCollection,captureMarketIntelligence} from "@/lib/sales-distribution/operational-service";import {executiveCheckOut,createFollowUp} from "@/lib/sales-distribution/field-portal-service";import {createDistributorProspect} from "@/lib/sales-distribution/manager-service";
import {acceptAndPrepareRetailerOrder,recordEasyDeliveryOutcome,deliverRemainingRetailerOrder} from "@/lib/sales-distribution/distributor-easy-mode-service";
const p=<T>(value:unknown)=>value as T;
async function dispatch(db:PrismaClient,userId:string,input:OfflineOperationInput){const data=input.payload;
 if(input.actionType==="ORDER_DRAFT"){
   // The originating WorkSession must be re-validated AT REPLAY TIME, not assumed from the client
   // — a device can queue an order while Active, then the day gets ended (or the session goes
   // stale) BEFORE the device regains connectivity. FieldJourney.tsx always sends visitId for a
   // field-visit order (the only caller today); no visitId means the session can't be verified, so
   // it is never treated as active. Same live-recheck pattern VISIT_DRAFT already uses below.
   const visitId=p<string|undefined>(data.visitId);
   const visit=visitId?await db.seeraVisit.findFirst({where:{id:visitId,retailerId:p<string>(data.retailerId),workSession:{employeeId:userId}},select:{checkedOutAt:true,workSession:{select:{status:true}}}}):null;
   const sessionActive=Boolean(visit&&visit.workSession.status==="ACTIVE"&&!visit.checkedOutAt);
   const retailer=await db.seeraRetailer.findUnique({where:{id:p<string>(data.retailerId)}}),lines=p<Array<{skuId:string;quantity:number;rate?:number;priceSnapshot?:number}>>(data.lines),skus=await db.seeraSku.findMany({where:{id:{in:lines.map(x=>x.skuId)}},include:{prices:{where:{tier:"DISTRIBUTOR_TO_RETAILER",status:"ACTIVE",effectiveFrom:{lte:new Date()},OR:[{effectiveTo:null},{effectiveTo:{gt:new Date()}}]},orderBy:{effectiveFrom:"desc"},take:1}}});const priceChanged=lines.some(line=>line.priceSnapshot!==undefined&&Number(skus.find(s=>s.id===line.skuId)?.prices[0]?.amount)!==line.priceSnapshot),conflict=classifyOfflineConflict({userActive:true,sessionActive,retailerActive:retailer?.lifecycle==="ACTIVE",skuActive:skus.length===lines.length&&skus.every(s=>s.status==="ACTIVE"),assignmentChanged:retailer?.distributorId!==p<string>(data.commercialPartyId),priceChanged});if(conflict)throw Object.assign(new FoundationError(conflict.code,"Offline order requires conflict resolution",409),{conflict});return placeRetailerOrder(db,{actorId:userId,sourcePortal:"sales-executive",commercialPartyType:"DISTRIBUTOR",commercialPartyId:p<string>(data.commercialPartyId)},{retailerId:p<string>(data.retailerId),idempotencyKey:input.clientOperationId,notes:p<string|undefined>(data.notes),lines,visitId,source:"FIELD_VISIT"});}
 if(input.actionType==="COLLECTION_DRAFT")return recordCollection(db,userId,{retailerId:p<string>(data.retailerId),amount:p<number>(data.amount),paymentMode:p<string>(data.paymentMode),reference:p<string|undefined>(data.reference),remarks:p<string|undefined>(data.remarks),idempotencyKey:input.clientOperationId});
 if(input.actionType==="MARKET_INTELLIGENCE_DRAFT")return captureMarketIntelligence(db,userId,p<Parameters<typeof captureMarketIntelligence>[2]>(data));
 if(input.actionType==="DAY_END_DRAFT"){await endFieldDay(db,userId,p<string>(data.sessionId),{outcome:p<string>(data.outcome),remarks:p<string|undefined>(data.remarks)});return{id:p<string>(data.sessionId)};}
 if(input.actionType==="VISIT_DRAFT"){const session=await db.seeraWorkSession.findFirst({where:{id:p<string>(data.workSessionId),employeeId:userId,status:"ACTIVE"}}),retailer=await db.seeraRetailer.findFirst({where:{id:p<string>(data.retailerId),salespersonId:userId,lifecycle:"ACTIVE"}});const conflict=classifyOfflineConflict({userActive:true,sessionActive:Boolean(session),retailerActive:Boolean(retailer),visitDuplicate:Boolean(await db.seeraVisit.findUnique({where:{idempotencyKey:input.clientOperationId}}))});if(conflict?.classification==="AUTO_RESOLVABLE")return await db.seeraVisit.findUniqueOrThrow({where:{idempotencyKey:input.clientOperationId}});if(conflict)throw Object.assign(new FoundationError(conflict.code,"Offline visit conflict",409),{conflict});return db.seeraVisit.create({data:{workSessionId:session!.id,retailerId:retailer!.id,checkedInAt:input.localCreatedAt,checkInLatitude:p<number|undefined>(data.latitude),checkInLongitude:p<number|undefined>(data.longitude),gpsExceptionReason:p<string|undefined>(data.gpsExceptionReason),idempotencyKey:input.clientOperationId}});}
 if(input.actionType==="VISIT_CHECK_OUT"||input.actionType==="NO_ORDER_DRAFT")return executiveCheckOut(db,userId,p<string>(data.visitId),p<Parameters<typeof executiveCheckOut>[3]>(data));
 if(input.actionType==="FOLLOW_UP_DRAFT")return createFollowUp(db,userId,{...p<Parameters<typeof createFollowUp>[2]>(data),idempotencyKey:input.clientOperationId});
 if(input.actionType==="DISTRIBUTOR_PROSPECT_DRAFT")return createDistributorProspect(db,userId,p<Parameters<typeof createDistributorProspect>[2]>(data));
 if(input.actionType==="DISTRIBUTOR_DECISION_DRAFT"){
   const distributorId=p<string>(data.distributorId);
   const orderId=p<string>(data.orderId);
   const existing=await db.seeraSalesOrder.findFirst({where:{id:orderId,sellerPartnerId:distributorId,type:"RETAILER_ORDER"},select:{status:true}});
   if(!existing)throw new FoundationError("ORDER_SCOPE_OR_STATE_DENIED","Offline distributor order is unavailable",403);
   if(existing.status==="REJECTED")return db.seeraSalesOrder.findUniqueOrThrow({where:{id:orderId}});
   return acceptAndPrepareRetailerOrder(db,userId,distributorId,{
     orderId,
     decision:p<"ACCEPT"|"PARTIAL_ACCEPT"|"REJECT">(data.decision),
     lines:p<{lineId:string;quantity:number}[]>(data.lines),
     reason:p<string|undefined>(data.reason),
     idempotencyKey:input.clientOperationId,
   });
 }
 if(input.actionType==="DISTRIBUTOR_DELIVERY_DRAFT"){
   return recordEasyDeliveryOutcome(db,userId,p<Parameters<typeof recordEasyDeliveryOutcome>[2]>(data));
 }
 if(input.actionType==="DISTRIBUTOR_REMAINING_DRAFT"){
   return deliverRemainingRetailerOrder(db,userId,p<string>(data.distributorId),{
     orderId:p<string>(data.orderId),
     lines:p<{lineId:string;quantity:number}[]>(data.lines),
     reason:p<string|undefined>(data.reason),
     idempotencyKey:input.clientOperationId,
   });
 }
 if(input.actionType==="DISTRIBUTOR_CLOSE_REMAINING_DRAFT"){
   const distributorId=p<string>(data.distributorId);
   const orderId=p<string>(data.orderId);
   const existing=await db.seeraSalesOrder.findFirst({where:{id:orderId,sellerPartnerId:distributorId,type:"RETAILER_ORDER",status:{in:["ACCEPTED","PARTIAL_ACCEPTED","HELD","ALLOCATED","DISPATCH_READY","DISPATCHED","PARTIAL_DELIVERED"]}},include:{lines:true}});
   if(!existing)throw new FoundationError("ORDER_SCOPE_OR_STATE_DENIED","Offline remaining-balance close is unavailable",403);
   const hasRemaining=existing.lines.some(line=>Number(line.orderedQuantity)-Number(line.acceptedQuantity)-Number(line.cancelledQuantity)>0);
   if(!hasRemaining)return existing;
   const {closeRemainingRetailerOrder}=await import("@/lib/sales-distribution/distributor-easy-mode-service");
   return closeRemainingRetailerOrder(db,userId,distributorId,{orderId,reason:p<string>(data.reason)});
 }
 throw new FoundationError("OFFLINE_ACTION_REVIEW_REQUIRED","This offline draft requires user review before authoritative submission",409);
}
export async function syncOfflineOperation(db:PrismaClient,userId:string,raw:unknown){const input=offlineOperationSchema.parse(raw),existing=await db.seeraOfflineOperation.findUnique({where:{userId_clientOperationId:{userId,clientOperationId:input.clientOperationId}}});if(existing?.status==="SYNCED")return existing;const operation=existing??await db.seeraOfflineOperation.create({data:{clientOperationId:input.clientOperationId,userId,deviceId:input.deviceId,sessionContext:input.sessionContext,entityType:input.entityType,actionType:input.actionType,localCreatedAt:input.localCreatedAt,payloadVersion:input.payloadVersion,originalPayload:input.payload as Prisma.InputJsonValue}}),user=await db.user.findUnique({where:{id:userId},select:{status:true}});if(user?.status!=="ACTIVE"){const conflict={classification:"SERVER_REJECTED" as const,code:"IDENTITY_OR_SESSION_REVOKED"};await db.seeraOfflineOperation.update({where:{id:operation.id},data:{status:"CONFLICT",conflictClass:conflict.classification,conflictDetails:conflict,lastErrorCode:conflict.code}});throw Object.assign(new FoundationError("OFFLINE_IDENTITY_REVOKED","Offline sync identity is unavailable",403),{conflict});}await db.seeraOfflineOperation.update({where:{id:operation.id},data:{status:"SYNCING",retryCount:{increment:existing?1:0}}});try{const result=await dispatch(db,userId,input);const acknowledgment={entityId:"id" in result?String(result.id):operation.id,actionType:input.actionType};const synced=await db.seeraOfflineOperation.update({where:{id:operation.id},data:{status:"SYNCED",serverAcknowledgment:acknowledgment,syncedAt:new Date(),lastErrorCode:null}});await recordAudit(db,{actorId:userId,action:"offline.operation.synced",entityType:"SeeraOfflineOperation",entityId:operation.id,details:acknowledgment});return synced;}catch(error){const conflict=typeof error==="object"&&error&&"conflict" in error?p<{classification:"AUTO_RESOLVABLE"|"USER_REVIEW_REQUIRED"|"SERVER_REJECTED";code:string}>((error as {conflict:unknown}).conflict):null;await db.seeraOfflineOperation.update({where:{id:operation.id},data:{status:conflict?"CONFLICT":"FAILED",conflictClass:conflict?.classification,conflictDetails:conflict as Prisma.InputJsonValue|undefined,lastErrorCode:conflict?.code??(typeof error==="object"&&error&&"code" in error?String(error.code):"SYNC_FAILED")}});throw error;}}
export async function listOfflineQueue(db:PrismaClient,userId:string){return db.seeraOfflineOperation.findMany({where:{userId},take:100,orderBy:{localCreatedAt:"desc"}});}
