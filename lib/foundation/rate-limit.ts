import { FoundationError } from "./errors";
type Counter={count:number;resetAt:number}; const counters=new Map<string,Counter>();
export function enforceRateLimit(key:string,limit:number,windowMs:number,now=Date.now()){const existing=counters.get(key);if(!existing||existing.resetAt<=now){counters.set(key,{count:1,resetAt:now+windowMs});return{remaining:limit-1,resetAt:now+windowMs};}if(existing.count>=limit)throw new FoundationError("RATE_LIMITED","Too many requests",429);existing.count+=1;return{remaining:limit-existing.count,resetAt:existing.resetAt};}
export function resetRateLimitsForTests(){counters.clear();}
