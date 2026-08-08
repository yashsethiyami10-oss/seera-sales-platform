"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { decideExpense } from "@/actions/inst-expenses";
import { useToast } from "@/components/ui/toast";

export function ExpenseDecision({ id, canApprove }: { id: string; canApprove: boolean }) {
  const router = useRouter();
  const { showToast } = useToast();
  const [pending, setPending] = useState(false);

  async function decide(approve: boolean) {
    setPending(true);
    const result = await decideExpense({ id, approve });
    setPending(false);
    if (!result.success) { showToast(result.error.message, { tone: "dark" }); return; }
    showToast(approve ? "Approved" : "Rejected", { tone: "dark" });
    router.refresh();
  }

  if (!canApprove) return <span className="text-xs" style={{ color: "rgba(var(--text-rgb),0.4)" }}>Pending manager review</span>;

  return (
    <div className="flex gap-1.5">
      <button type="button" disabled={pending} onClick={() => decide(true)} className="muv-os-btn-ghost rounded-lg px-2 py-1 text-xs" style={{ border: "1px solid rgba(34,197,94,0.4)", color: "#22c55e" }}>Approve</button>
      <button type="button" disabled={pending} onClick={() => decide(false)} className="muv-os-btn-ghost rounded-lg px-2 py-1 text-xs" style={{ border: "1px solid rgba(239,68,68,0.4)", color: "#ef4444" }}>Reject</button>
    </div>
  );
}
