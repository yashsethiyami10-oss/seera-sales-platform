export type TimePreset = "TODAY"|"YESTERDAY"|"THIS_WEEK"|"LAST_WEEK"|"THIS_MONTH"|"LAST_MONTH"|"QUARTER"|"YTD"|"FINANCIAL_YEAR"|"CUSTOM";
export type DateRange = { from: Date; to: Date };

const dayStart=(d:Date)=>new Date(d.getFullYear(),d.getMonth(),d.getDate());
const dayEnd=(d:Date)=>new Date(d.getFullYear(),d.getMonth(),d.getDate(),23,59,59,999);
export function resolveRange(preset:TimePreset,now=new Date(),custom?:DateRange):DateRange {
  const today=dayStart(now), end=dayEnd(now), dow=(today.getDay()+6)%7;
  if(preset==="CUSTOM"){if(!custom||custom.from>custom.to)throw new Error("A valid custom range is required");return custom;}
  if(preset==="TODAY")return{from:today,to:end};
  if(preset==="YESTERDAY"){const d=new Date(today);d.setDate(d.getDate()-1);return{from:d,to:dayEnd(d)};}
  if(preset==="THIS_WEEK"){const d=new Date(today);d.setDate(d.getDate()-dow);return{from:d,to:end};}
  if(preset==="LAST_WEEK"){const to=new Date(today);to.setDate(to.getDate()-dow-1);const from=new Date(to);from.setDate(from.getDate()-6);return{from,to:dayEnd(to)};}
  if(preset==="THIS_MONTH")return{from:new Date(now.getFullYear(),now.getMonth(),1),to:end};
  if(preset==="LAST_MONTH")return{from:new Date(now.getFullYear(),now.getMonth()-1,1),to:dayEnd(new Date(now.getFullYear(),now.getMonth(),0))};
  if(preset==="QUARTER")return{from:new Date(now.getFullYear(),Math.floor(now.getMonth()/3)*3,1),to:end};
  if(preset==="YTD")return{from:new Date(now.getFullYear(),0,1),to:end};
  const fyYear=now.getMonth()>=3?now.getFullYear():now.getFullYear()-1;
  return{from:new Date(fyYear,3,1),to:end};
}
export function previousComparable({from,to}:DateRange):DateRange {const duration=to.getTime()-from.getTime();return{from:new Date(from.getTime()-duration-1),to:new Date(from.getTime()-1)};}
export function monthKey(date:Date){return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,"0")}`;}
export function monthSeries<T extends Record<string,number>>(range:DateRange,rows:Array<{date:Date;values:T}>,keys:(keyof T)[]){
  const grouped=new Map<string,T>();for(const row of rows){const key=monthKey(row.date);const current=grouped.get(key)??Object.fromEntries(keys.map(k=>[k,0])) as T;for(const field of keys)(current as Record<string,number>)[String(field)]=((current as Record<string,number>)[String(field)]??0)+(row.values[field]??0);grouped.set(key,current);}
  const result:Array<{month:string;values:T}>=[];const cursor=new Date(range.from.getFullYear(),range.from.getMonth(),1);const last=new Date(range.to.getFullYear(),range.to.getMonth(),1);
  while(cursor<=last){const key=monthKey(cursor);result.push({month:key,values:grouped.get(key)??Object.fromEntries(keys.map(k=>[k,0])) as T});cursor.setMonth(cursor.getMonth()+1);}return result;
}
export function comparison(current:number,previous:number){const absolute=current-previous;return{current,previous,absolute,percentage:previous===0?(current===0?0:null):(absolute/previous)*100};}
