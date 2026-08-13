"use client";
import {useRouter} from "next/navigation";import {useState} from "react";import styles from "./WorkflowActions.module.css";import {FileUploadField} from "./FileUploadField";
type Option={value:string;label:string};
type PartyOrder={id:string;label:string;partnerId:string};
type Kind="payment"|"claim"|"promise"|"extension";
const TITLE:Record<Kind,[string,string]>={payment:["PAYMENT PROOF","भुगतान प्रमाण"],claim:["PARTNER CLAIM","भागीदार दावा"],promise:["PAYMENT PROMISE","भुगतान वादा"],extension:["CREDIT EXTENSION","क्रेडिट एक्सटेंशन"]};
const HEADING:Record<Kind,[string,string]>={payment:["Submit payment for Accounts review","भुगतान समीक्षा हेतु जमा करें"],claim:["Submit a new claim","नया दावा दर्ज करें"],promise:["Record a distributor's payment commitment","वितरक की भुगतान प्रतिबद्धता दर्ज करें"],extension:["Request a credit extension for Accounts approval","खाता स्वीकृति हेतु क्रेडिट एक्सटेंशन का अनुरोध करें"]};
const ACTION:Record<Kind,string>={payment:"submit-partner-payment",claim:"submit-partner-claim",promise:"record-payment-promise",extension:"request-credit-extension"};
export function PartnerFinanceActions({kind,language,partnerType,parties,orders=[],sourcePortal="super-stockist"}:{kind:Kind;language:"EN"|"HI";partnerType:"DISTRIBUTOR"|"SUPER_STOCKIST";parties:Option[];orders?:PartyOrder[];sourcePortal?:"sales-manager"|"super-stockist"}){
  const hi=language==="HI",router=useRouter(),[busy,setBusy]=useState(false),[message,setMessage]=useState(""),[orderId,setOrderId]=useState(""),chosen=orders.find((x)=>x.id===orderId),orderBased=kind==="promise"||kind==="extension",[selectedPartnerId,setSelectedPartnerId]=useState(parties[0]?.value??""),[proofFileId,setProofFileId]=useState("");
  return <section className={styles.panel}>
    <div><small>{hi?TITLE[kind][1]:TITLE[kind][0]}</small><h2>{hi?HEADING[kind][1]:HEADING[kind][0]}</h2></div>
    <form onSubmit={async(e)=>{
      e.preventDefault();setBusy(true);setMessage("");
      try{
        const f=new FormData(e.currentTarget);
        if(orderBased&&!chosen){setBusy(false);return;}
        const payload=
          kind==="payment"?{partnerType,partnerId:String(f.get("partnerId")),amount:Number(f.get("amount")),reference:String(f.get("reference")),paymentMode:String(f.get("paymentMode")),paymentDate:String(f.get("paymentDate")),proofId:proofFileId||undefined,idempotencyKey:crypto.randomUUID()}
          :kind==="claim"?{partnerType,partnerId:String(f.get("partnerId")),type:String(f.get("type")),sourceType:String(f.get("sourceType")||"")||undefined,sourceId:String(f.get("sourceId")||"")||undefined,details:{description:String(f.get("description")),amount:Number(f.get("amount")||0)},idempotencyKey:crypto.randomUUID()}
          :kind==="promise"?(sourcePortal==="sales-manager"?{orderId:chosen!.id,promisedPaymentDate:String(f.get("promisedPaymentDate")),reason:String(f.get("reason")),verbalCommitmentContext:String(f.get("verbalCommitmentContext")||"")||undefined}:{orderId:chosen!.id,partyId:chosen!.partnerId,promisedPaymentDate:String(f.get("promisedPaymentDate")),reason:String(f.get("reason")),verbalCommitmentContext:String(f.get("verbalCommitmentContext")||"")||undefined,sourcePortal:"super-stockist"})
          :{orderId:chosen!.id,partyId:chosen!.partnerId,extensionUntil:String(f.get("extensionUntil")),reason:String(f.get("reason")),idempotencyKey:crypto.randomUUID()};
        const endpoint=kind==="promise"&&sourcePortal==="sales-manager"?"/api/manager/operations":"/api/distribution/operations";
        const response=await fetch(endpoint,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({action:ACTION[kind],payload})}),
          data=await response.json().catch(()=>({}));
        if(!response.ok)throw new Error(data?.error?.message??data?.error?.code??"Submission failed");
        setMessage(hi?"समीक्षा हेतु सफलतापूर्वक जमा हुआ।":"Submitted successfully for review.");
        router.refresh();
      }catch(error){setMessage(error instanceof Error?error.message:"Submission failed");}finally{setBusy(false);}
    }}>
      {orderBased?<>
        <label>{hi?"वितरक ऑर्डर":"Distributor order"}<select value={orderId} onChange={(e)=>setOrderId(e.target.value)} required><option value="">{hi?"ऑर्डर नंबर से चुनें":"Choose by order number"}</option>{orders.map((o)=><option key={o.id} value={o.id}>{o.label}</option>)}</select></label>
        {kind==="promise"?<>
          <label>{hi?"वादा की गई भुगतान तिथि":"Promised payment date"}<input name="promisedPaymentDate" type="date" required/></label>
          <label>{hi?"कारण / संदर्भ":"Reason / context"}<input name="reason" minLength={3} required/></label>
          <label>{hi?"मौखिक प्रतिबद्धता का विवरण (वैकल्पिक)":"Verbal commitment context (optional)"}<input name="verbalCommitmentContext"/></label>
        </>:<>
          <label>{hi?"अनुरोधित विस्तारित तिथि":"Requested extended date"}<input name="extensionUntil" type="date" required/></label>
          <label>{hi?"कारण *":"Reason *"}<input name="reason" minLength={3} required/></label>
        </>}
      </>:<>
        <label>{hi?"व्यावसायिक इकाई":"Business party"}<select name="partnerId" required value={selectedPartnerId} onChange={(e)=>setSelectedPartnerId(e.target.value)}>{parties.map((x)=><option key={x.value} value={x.value}>{x.label}</option>)}</select></label>
        {kind==="payment"?<>
          <label>{hi?"राशि":"Amount"}<input name="amount" type="number" min="0.01" step="0.01" required/></label>
          <label>{hi?"बैंक / UTR संदर्भ":"Bank / UTR reference"}<input name="reference" minLength={3} required/></label>
          <label>{hi?"भुगतान माध्यम":"Payment mode"}<select name="paymentMode"><option>NEFT</option><option>RTGS</option><option>IMPS</option><option>UPI</option><option>CHEQUE</option></select></label>
          <label>{hi?"भुगतान तिथि":"Payment date"}<input name="paymentDate" type="date" defaultValue={new Date().toISOString().slice(0,10)} required/></label>
          {selectedPartnerId&&<FileUploadField language={language} documentType="PAYMENT_PROOF" issuerType={partnerType} issuerId={selectedPartnerId} buyerType={partnerType==="DISTRIBUTOR"?"SUPER_STOCKIST":"COMPANY"} buyerId={partnerType==="DISTRIBUTOR"?"SEERA_SS":"SEERA_COMPANY"} sourcePortal={sourcePortal} amount={0} onUploaded={setProofFileId}/>}
        </>:<>
          <label>{hi?"दावा प्रकार":"Claim type"}<select name="type"><option>DAMAGE</option><option>SHORTAGE</option><option>RATE_DIFFERENCE</option><option>SCHEME</option><option>DELIVERY_ISSUE</option><option>RETURN</option><option>OTHER</option></select></label>
          <label>{hi?"स्रोत प्रकार":"Source type"}<input name="sourceType"/></label>
          <label>{hi?"ऑर्डर / दस्तावेज़ नंबर":"Order / document reference"}<input name="sourceId"/></label>
          <label>{hi?"विवरण":"Description"}<input name="description" minLength={3} required/></label>
          <label>{hi?"दावा राशि":"Claimed amount"}<input name="amount" type="number" min="0" step="0.01"/></label>
        </>}
      </>}
      <button disabled={busy||(orderBased?!orders.length:!parties.length)}>{hi?"जमा करें":"Submit"}</button>
    </form>
    {message&&<p role="status">{message}</p>}
  </section>;
}
