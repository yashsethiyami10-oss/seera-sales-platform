import type { PrismaClient } from "@prisma/client";
import { analyticsScope,type AnalyticsPortal } from "./scope";
import { salesMetrics,salesMonthSeries,targetMetrics,fieldMetrics,inventoryMetrics } from "./analytics-engine";
import { resolveRange,type TimePreset } from "./time-intelligence";
const n=(value:unknown)=>Number(value??0);
export async function getDashboard(prisma:PrismaClient,userId:string,portal:AnalyticsPortal,preset:TimePreset="FINANCIAL_YEAR"){
  const range=resolveRange(preset),scope=await analyticsScope(prisma,userId,portal);
  const orderWhere={createdAt:{gte:range.from,lte:range.to},...(scope.employeeIds?{salespersonId:{in:scope.employeeIds}}:{}),...(scope.partyIds?{OR:[{buyerPartnerId:{in:scope.partyIds}},{sellerPartnerId:{in:scope.partyIds}}]}:{})};
  const [lines,visits,movements,targets,collections,partners,paymentProofs,reconciliations]=await Promise.all([
    prisma.seeraOrderLine.findMany({where:{order:orderWhere},include:{order:{select:{id:true,status:true,createdAt:true,salespersonId:true,buyerPartnerId:true}}}}),
    prisma.seeraVisit.findMany({where:{checkedInAt:{gte:range.from,lte:range.to},...(scope.employeeIds?{workSession:{employeeId:{in:scope.employeeIds}}}:{})},select:{id:true,outcome:true,retailerId:true}}),
    prisma.seeraInventoryMovement.findMany({where:{occurredAt:{gte:range.from,lte:range.to},...(scope.partyIds?{partyId:{in:scope.partyIds}}:{})},select:{quantity:true,direction:true,type:true,occurredAt:true}}),
    prisma.seeraTarget.findMany({where:{periodEnd:{gte:range.from},periodStart:{lte:range.to},...(scope.employeeIds?{employeeId:{in:scope.employeeIds}}:{})}}),
    prisma.seeraCollectionEntry.aggregate({where:{collectedAt:{gte:range.from,lte:range.to},...(scope.employeeIds?{actorId:{in:scope.employeeIds}}:{})},_sum:{amount:true}}),
    prisma.seeraPartner.count({where:{lifecycle:"ACTIVE",...(portal==="distributor"?{type:"DISTRIBUTOR"}:portal==="super-stockist"?{type:"SUPER_STOCKIST"}:{})}}),
    prisma.seeraPaymentProof.count({where:{status:"SUBMITTED"}}),prisma.seeraFinancialReconciliation.count({where:{status:"OPEN"}})
  ]);
  const facts=lines.map(l=>({id:l.order.id,occurredAt:l.order.createdAt,status:l.order.status,orderedQty:n(l.orderedQuantity),deliveredQty:n(l.deliveredQuantity),cancelledQty:n(l.cancelledQuantity),refusedQty:n(l.refusedQuantity),returnedQty:n(l.returnedQuantity),unitPrice:n(l.priceSnapshot),salespersonId:l.order.salespersonId??undefined,buyerPartyId:l.order.buyerPartnerId??undefined}));
  const sales=salesMetrics(facts),target=targets.reduce((sum,t)=>sum+n(t.targetValue),0),targetState=targetMetrics(target,sales.netEligibleDeliveredValue,range.to),field=fieldMetrics(visits.map(v=>({id:v.id,outcome:v.outcome,...(v.retailerId?{retailerId:v.retailerId}:{})}))),inventory=inventoryMetrics(movements.map(m=>({quantity:n(m.quantity),direction:m.direction,type:m.type,occurredAt:m.occurredAt})));
  return{portal,preset,range:{from:range.from.toISOString(),to:range.to.toISOString()},sales:{...sales,orders:sales.orders.size},target:targetState,field,inventory,collection:n(collections._sum.amount),activePartners:partners,paymentProofsPending:paymentProofs,reconciliationExceptions:reconciliations,months:salesMonthSeries(range,facts),scope:{employeeCount:scope.employeeIds?.length??null,partyCount:scope.partyIds?.length??null}};
}
