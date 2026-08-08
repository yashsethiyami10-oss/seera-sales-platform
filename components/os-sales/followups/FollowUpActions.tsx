"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { completeFollowUp, cancelFollowUp } from "@/actions/inst-followups";
import { useToast } from "@/components/ui/toast";

export function FollowUpActions({ id, status }: { id: string; status: string }) {
  const router = useRouter();
  const { showToast } = useToast();
  const [pending, setPending] = useState(false);

  async function run(action: (input: unknown) => Promise<{ success: boolean; error?: { message: string } }>, label: string) {
    setPending(true);
    const result = await action({ id });
    setPending(false);
    if (!result.success) { showToast(result.error!.message, { tone: "dark" }); return; }
    showToast(label, { tone: "dark" });
    router.refresh();
  }

  if (status !== "PENDING") return <span className="text-xs" style={{ color: "rgba(var(--text-rgb),0.4)" }}>{status}</span>;

  return (
    <div className="flex gap-1.5">
      <button type="button" disabled={pending} onClick={() => run(completeFollowUp, "Marked complete")} className="muv-os-btn-ghost rounded-lg px-2 py-1 text-xs" style={{ border: "1px solid var(--card-border)", color: "#22c55e" }}>Complete</button>
      <button type="button" disabled={pending} onClick={() => run(cancelFollowUp, "Cancelled")} className="muv-os-btn-ghost rounded-lg px-2 py-1 text-xs" style={{ border: "1px solid var(--card-border)", color: "rgba(var(--text-rgb),0.5)" }}>Cancel</button>
    </div>
  );
}
