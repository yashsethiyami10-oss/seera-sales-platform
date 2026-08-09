"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import styles from "./WorkflowActions.module.css";

type Option={value:string;label:string;meta:string};
export function PaymentProofReviewActions({language,options}:{language:"EN"|"HI";options:Option[]}){
  const hi=language==="HI",router=useRouter(),[busy,setBusy]=useState(false),[message,setMessage]=useState("");
  return <section className={styles.panel}><div><small>{hi?"निर्माता-जाँचकर्ता":"MAKER-CHECKER"}</small><h2>{hi?"अग्रिम भुगतान प्रमाण समीक्षा":"Advance payment proof review"}</h2></div>
    <form onSubmit={async(e)=>{e.preventDefault();setBusy(true);setMessage("");try{const f=new FormData(e.currentTarget),response=await fetch("/api/finance/operations",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({action:"review-payment-proof",payload:{proofId:String(f.get("proofId")),status:String(f.get("status")),reason:String(f.get("reason"))}})}),data=await response.json().catch(()=>({}));if(!response.ok)throw new Error(data?.error?.message??data?.error?.code??"Review failed");setMessage(hi?"भुगतान प्रमाण की समीक्षा पूरी हुई।":"Payment proof review completed.");router.refresh();}catch(error){setMessage(error instanceof Error?error.message:"Review failed");}finally{setBusy(false);}}}>
      <label>{hi?"प्रमाण चुनें":"Select proof"}<select name="proofId" required><option value="">{hi?"ऑर्डर नंबर से चुनें":"Choose by order number"}</option>{options.map((x)=><option key={x.value} value={x.value}>{x.label} · {x.meta}</option>)}</select></label>
      <label>{hi?"निर्णय":"Decision"}<select name="status"><option value="VERIFIED">{hi?"सत्यापित":"Verified"}</option><option value="UNDER_REVIEW">{hi?"समीक्षाधीन":"Under review"}</option><option value="PARTIALLY_MATCHED">{hi?"आंशिक मिलान":"Partially matched"}</option><option value="ADVANCE_HELD">{hi?"अग्रिम रोका गया":"Advance held"}</option><option value="REJECTED">{hi?"अस्वीकृत":"Rejected"}</option></select></label>
      <label>{hi?"समीक्षा कारण":"Review reason"}<input name="reason" minLength={3} required /></label>
      <button disabled={busy||!options.length}>{hi?"समीक्षा सहेजें":"Save independent review"}</button>
    </form>{message&&<p role="status">{message}</p>}</section>;
}
