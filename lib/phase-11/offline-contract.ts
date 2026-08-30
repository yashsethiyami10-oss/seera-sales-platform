import {z} from "zod";
export const OFFLINE_ACTIONS=["VISIT_DRAFT","VISIT_CHECK_OUT","ORDER_DRAFT","NO_ORDER_DRAFT","COLLECTION_DRAFT","FOLLOW_UP_DRAFT","MARKET_INTELLIGENCE_DRAFT","DISTRIBUTOR_PROSPECT_DRAFT","DAY_END_DRAFT","DISTRIBUTOR_DECISION_DRAFT","DISTRIBUTOR_DELIVERY_DRAFT","DISTRIBUTOR_REMAINING_DRAFT","DISTRIBUTOR_CLOSE_REMAINING_DRAFT"] as const;
export type OfflineAction=(typeof OFFLINE_ACTIONS)[number];
export const offlineOperationSchema=z.object({clientOperationId:z.string().uuid(),deviceId:z.string().min(8).max(128).regex(/^[A-Za-z0-9._:-]+$/),sessionContext:z.object({sessionId:z.string().min(1).max(160),appVersion:z.string().min(1).max(40),platform:z.string().max(80)}).strict(),entityType:z.string().min(1).max(80),actionType:z.enum(OFFLINE_ACTIONS),localCreatedAt:z.coerce.date(),payloadVersion:z.literal(1),payload:z.record(z.unknown())}).strict().superRefine((value,ctx)=>{if(JSON.stringify(value.payload).length>100_000)ctx.addIssue({code:"custom",message:"Offline payload exceeds 100 KB"});});
export type OfflineOperationInput=z.infer<typeof offlineOperationSchema>;
export type OfflineQueueStatus="PENDING"|"SYNCING"|"SYNCED"|"FAILED"|"CONFLICT"|"CANCELLED";
export function backoffMs(retryCount:number,jitter=0){return Math.min(3_600_000,Math.pow(2,Math.max(0,retryCount))*1000)+Math.max(0,Math.min(999,jitter));}
