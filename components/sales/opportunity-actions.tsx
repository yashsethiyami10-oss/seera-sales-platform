"use client";

import { FormEvent, useState, useTransition } from "react";
import { addOpportunityNoteAction, transitionOpportunityAction, updateOpportunityAction } from "@/actions/opportunities";

export function OpportunityActions({ opportunityId, stages, probability, estimatedValue }: {
  opportunityId: string; stages: { code: string; name: string }[]; probability: number; estimatedValue: string;
}) {
  const [message, setMessage] = useState("");
  const [pending, startTransition] = useTransition();
  function submit(event: FormEvent<HTMLFormElement>, type: "stage"|"value"|"note") {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    startTransition(async()=>{
      const result = type==="stage"
        ? await transitionOpportunityAction({ opportunityId, targetStageCode: form.get("stage"), reason: form.get("reason"),
            lostReasonCode: form.get("lostReason") || undefined, wonReasonCode: form.get("wonReason") || undefined })
        : type==="value"
          ? await updateOpportunityAction({ opportunityId, probability: Number(form.get("probability")), estimatedValue: Number(form.get("estimatedValue")),
              expectedCloseDate: form.get("expectedCloseDate") || null })
          : await addOpportunityNoteAction({ opportunityId, note: form.get("note"), visibility: form.get("visibility") });
      setMessage(result.success ? "Saved" : result.error.message);
      if (result.success && type==="note") event.currentTarget.reset();
    });
  }
  return <article className="rounded-2xl border border-white/10 p-5">
    <h2 className="font-medium">Authorized Quick Actions</h2>{message&&<p className="mt-2 text-sm text-amber-400">{message}</p>}
    <div className="mt-4 grid gap-4 lg:grid-cols-3">
      <form onSubmit={event=>submit(event,"stage")} className="space-y-2"><select name="stage" className="w-full rounded-lg bg-zinc-900 p-2">{stages.map(s=><option key={s.code} value={s.code}>{s.name}</option>)}</select><input name="reason" placeholder="Reason" className="w-full rounded-lg bg-white/5 p-2"/><input name="lostReason" placeholder="Lost reason code if lost" className="w-full rounded-lg bg-white/5 p-2"/><button disabled={pending} className="rounded-lg bg-amber-400 px-3 py-2 text-black">Move stage</button></form>
      <form onSubmit={event=>submit(event,"value")} className="space-y-2"><input name="estimatedValue" type="number" min="0" defaultValue={estimatedValue} className="w-full rounded-lg bg-white/5 p-2"/><input name="probability" type="number" min="0" max="100" defaultValue={probability} className="w-full rounded-lg bg-white/5 p-2"/><input name="expectedCloseDate" type="date" className="w-full rounded-lg bg-white/5 p-2"/><button disabled={pending} className="rounded-lg bg-amber-400 px-3 py-2 text-black">Update forecast</button></form>
      <form onSubmit={event=>submit(event,"note")} className="space-y-2"><textarea name="note" required placeholder="Internal note" className="w-full rounded-lg bg-white/5 p-2"/><select name="visibility" className="w-full rounded-lg bg-zinc-900 p-2"><option>INTERNAL</option><option>MANAGER</option><option>PRIVATE</option></select><button disabled={pending} className="rounded-lg bg-amber-400 px-3 py-2 text-black">Add note</button></form>
    </div>
  </article>;
}
