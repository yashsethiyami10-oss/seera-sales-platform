type Metric="api_requests"|"api_errors"|"db_failures"|"auth_failures"|"offline_sync_failures"|"offline_conflicts"|"automation_failures"|"document_failures";
const metrics=new Map<Metric,number>();
export function incrementMetric(name:Metric,value=1){metrics.set(name,(metrics.get(name)??0)+value);}
export function metricsSnapshot(){return Object.fromEntries(metrics);}
export function resetMetricsForTests(){metrics.clear();}
export function safeLog(input:{level:"info"|"warn"|"error";event:string;correlationId:string;route?:string;portal?:string;userId?:string;role?:string;latencyMs?:number;errorClass?:string}){const safe={timestamp:new Date().toISOString(),...input,userId:input.userId?`user:${input.userId.slice(-8)}`:undefined};const line=JSON.stringify(safe);if(input.level==="error")console.error(line);else if(input.level==="warn")console.warn(line);else console.info(line);return safe;}
