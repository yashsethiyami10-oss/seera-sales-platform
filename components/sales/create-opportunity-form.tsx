"use client";
import { FormEvent, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createOpportunityAction } from "@/actions/opportunities";

export function CreateOpportunityForm({ customers }: { customers: { id: string; label: string }[] }) {
  const router = useRouter();
  const [message, setMessage] = useState("");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({});
  const [pending, start] = useTransition();

  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    start(async () => {
      const r = await createOpportunityAction({
        customerId: f.get("customerId"),
        estimatedValue: f.get("estimatedValue"),
        expectedCloseDate: f.get("expectedCloseDate") || undefined,
        priorityCode: f.get("priorityCode"),
      });
      if (r.success) {
        router.push(`/sales/opportunities/${r.data.id}`);
      } else {
        setMessage(r.error.message);
        setFieldErrors(r.error.fieldErrors ?? {});
      }
    });
  }

  return (
    <form onSubmit={submit} className="grid gap-4 rounded-2xl border border-white/10 p-5 md:grid-cols-2">
      <div>
        <label htmlFor="customerId" className="mb-1 flex items-baseline gap-2 text-xs font-medium text-zinc-400">
          <span>Customer</span><span className="text-amber-400">Required</span>
        </label>
        <select id="customerId" name="customerId" required className="w-full rounded-lg bg-zinc-900 p-3">
          <option value="">Select customer…</option>
          {customers.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
        </select>
        {fieldErrors.customerId?.length ? <p className="mt-1 text-xs text-red-400">{fieldErrors.customerId.join(" ")}</p> : null}
      </div>

      <div>
        <label htmlFor="estimatedValue" className="mb-1 flex items-baseline gap-2 text-xs font-medium text-zinc-400">
          <span>Estimated Value (₹)</span><span className="text-amber-400">Required</span>
        </label>
        <input id="estimatedValue" name="estimatedValue" type="number" min="0" step="0.01" required className="w-full rounded-lg bg-white/5 p-3" />
        {fieldErrors.estimatedValue?.length ? <p className="mt-1 text-xs text-red-400">{fieldErrors.estimatedValue.join(" ")}</p> : null}
      </div>

      <div>
        <label htmlFor="expectedCloseDate" className="mb-1 flex items-baseline gap-2 text-xs font-medium text-zinc-400">
          <span>Expected Close Date</span><span className="text-zinc-600">Optional</span>
        </label>
        <input id="expectedCloseDate" name="expectedCloseDate" type="date" className="w-full rounded-lg bg-white/5 p-3" />
      </div>

      <div>
        <label htmlFor="priorityCode" className="mb-1 flex items-baseline gap-2 text-xs font-medium text-zinc-400">
          <span>Priority</span><span className="text-zinc-600">Optional</span>
        </label>
        <select id="priorityCode" name="priorityCode" defaultValue="NORMAL" className="w-full rounded-lg bg-zinc-900 p-3">
          {["LOW", "NORMAL", "HIGH", "URGENT"].map((x) => <option key={x} value={x}>{x}</option>)}
        </select>
      </div>

      <button disabled={pending} className="rounded-lg bg-amber-400 p-3 text-black md:col-span-2">{pending ? "Creating…" : "Create opportunity"}</button>
      {message && <p className="p-3 text-amber-400 md:col-span-2">{message}</p>}
    </form>
  );
}
