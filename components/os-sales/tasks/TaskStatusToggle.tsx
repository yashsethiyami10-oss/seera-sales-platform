"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { updateTaskStatus } from "@/actions/inst-tasks";
import { useToast } from "@/components/ui/toast";

export function TaskStatusToggle({ id, status }: { id: string; status: string }) {
  const router = useRouter();
  const { showToast } = useToast();
  const [pending, setPending] = useState(false);

  async function set(next: string) {
    setPending(true);
    const result = await updateTaskStatus({ id, status: next });
    setPending(false);
    if (!result.success) { showToast(result.error.message, { tone: "dark" }); return; }
    router.refresh();
  }

  if (status === "COMPLETED") return <span className="text-xs" style={{ color: "#22c55e" }}>Completed</span>;
  if (status === "CANCELLED") return <span className="text-xs" style={{ color: "rgba(var(--text-rgb),0.4)" }}>Cancelled</span>;

  return (
    <div className="flex gap-1.5">
      {status === "PENDING" && <button type="button" disabled={pending} onClick={() => set("IN_PROGRESS")} className="muv-os-btn-ghost rounded-lg px-2 py-1 text-xs" style={{ border: "1px solid var(--card-border)", color: "var(--lavender)" }}>Start</button>}
      <button type="button" disabled={pending} onClick={() => set("COMPLETED")} className="muv-os-btn-ghost rounded-lg px-2 py-1 text-xs" style={{ border: "1px solid rgba(34,197,94,0.4)", color: "#22c55e" }}>Complete</button>
      <button type="button" disabled={pending} onClick={() => set("CANCELLED")} className="muv-os-btn-ghost rounded-lg px-2 py-1 text-xs" style={{ border: "1px solid var(--card-border)", color: "rgba(var(--text-rgb),0.4)" }}>Cancel</button>
    </div>
  );
}
