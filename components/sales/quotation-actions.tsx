"use client";
import {FormEvent,useState,useTransition} from "react";
import {createQuotationRevisionAction,requestQuotationApprovalAction,transitionQuotationAction} from "@/actions/quotations";
export function QuotationActions({versionId,status}:{versionId:string;status:string}){
 const [message,setMessage]=useState("");const [pending,start]=useTransition();
 const run=(fn:()=>Promise<{success:boolean;error?:{message:string}}>)=>start(async()=>{const r=await fn();setMessage(r.success?"Saved":r.error?.message??"Failed")});
 function submit(e:FormEvent<HTMLFormElement>){e.preventDefault();const f=new FormData(e.currentTarget);run(()=>transitionQuotationAction({versionId,targetCode:f.get("status"),reason:f.get("reason")}));}
 return <div className="rounded-2xl border border-white/10 p-5"><h2>Commercial Actions</h2>{message&&<p className="mt-2 text-sm text-amber-400">{message}</p>}
  <div className="mt-3 flex flex-wrap gap-3"><form onSubmit={submit} className="flex gap-2"><select name="status" className="rounded-lg bg-zinc-900 p-2">{["PENDING_APPROVAL","APPROVED","SENT","VIEWED","ACCEPTED","REJECTED","EXPIRED","CANCELLED"].map(s=><option key={s}>{s}</option>)}</select><input name="reason" placeholder="Reason" className="rounded-lg bg-white/5 p-2"/><button disabled={pending} className="rounded-lg bg-amber-400 px-3 text-black">Change status</button></form>
  {status==="DRAFT"&&<button onClick={()=>run(()=>requestQuotationApprovalAction({versionId,ruleCode:"STANDARD_APPROVAL"}))} className="rounded-lg border px-3">Request approval</button>}
  <button onClick={()=>run(()=>createQuotationRevisionAction({versionId,reason:"Commercial revision"}))} className="rounded-lg border px-3">Create revision</button>
  <a href={`/api/sales/quotations/versions/${versionId}/pdf`} className="rounded-lg border px-3 py-2">Generate PDF</a></div></div>;
}
