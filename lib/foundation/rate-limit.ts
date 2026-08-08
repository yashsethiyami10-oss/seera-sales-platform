import { FoundationError } from "./errors";
type Counter={count:number;resetAt:number}; const counters=new Map<string,Counter>();
export type RateLimitBackend="memory"|"distributed";
let backend:RateLimitBackend="memory";
export function configureRateLimitBackend(value:RateLimitBackend){backend=value;}
export function validateRateLimitTopology(input:{replicaCount:number;backend?:RateLimitBackend}){const selected=input.backend??backend;if(selected==="distributed")throw new FoundationError("DISTRIBUTED_RATE_LIMIT_NOT_CONFIGURED","The distributed rate-limit adapter is not configured",500);if(input.replicaCount>1)throw new FoundationError("DISTRIBUTED_RATE_LIMIT_REQUIRED","Multiple application replicas require a distributed rate-limit backend",500);return{backend:selected,replicaCount:input.replicaCount,ready:true};}
export function enforceRateLimit(key:string,limit:number,windowMs:number,now=Date.now()){const existing=counters.get(key);if(!existing||existing.resetAt<=now){counters.set(key,{count:1,resetAt:now+windowMs});return{remaining:limit-1,resetAt:now+windowMs};}if(existing.count>=limit)throw new FoundationError("RATE_LIMITED","Too many requests",429);existing.count+=1;return{remaining:limit-existing.count,resetAt:existing.resetAt};}
export function resetRateLimitsForTests(){counters.clear();}
