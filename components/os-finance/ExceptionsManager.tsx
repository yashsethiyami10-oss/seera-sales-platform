"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { retryFinanceEvent } from "@/actions/finance";
import { useToast } from "@/components/ui/toast";

type LogEntry = { id: string; sourceModule: string; sourceEventAction: string; sourceRecordId: string; status: string; failureReason: string | null; retryCount: number };
const fieldStyle = { border: "1px solid var(--card-border)", color: "rgba(var(--text-rgb),0.9)" } as const;

/** Milestone 8 — Critical Event Processing Safeguard. Every row here is a business event that either posted exactly once or is a visible, retriable exception — nothing ever disappears silently. */
export function ExceptionsManager({ entries }: { entries: LogEntry[] }) {
  const router = useRouter();
  const { showToast } = useToast();
  const [pending, setPending] = useState(false);

  async function retry(id: string) {
    setPending(true);
    const result = await retryFinanceEvent(id);
    setPending(false);
    if (!result.success) { showToast(result.error.message, { tone: "dark" }); return; }
    showToast(`Retry result: ${result.data.status}`, { tone: "dark" });
    router.refresh();
  }

  return (
    <div className="overflow-x-auto rounded-2xl" style={{ border: "1px solid var(--card-border)" }}>
      <table className="w-full text-sm">
        <thead><tr style={{ borderBottom: "1px solid var(--card-border)" }}>{["Module", "Event", "Record", "Status", "Failure Reason", "Retries", "Actions"].map((h) => <th key={h} className="px-4 py-3 text-left text-xs font-medium uppercase" style={{ color: "rgba(var(--text-rgb),0.45)" }}>{h}</th>)}</tr></thead>
        <tbody>
          {entries.length === 0 ? (
            <tr><td colSpan={7} className="px-4 py-8 text-center text-sm" style={{ color: "rgba(var(--text-rgb),0.45)" }}>No exceptions — every eligible event posted cleanly.</td></tr>
          ) : entries.map((e) => (
            <tr key={e.id} style={{ borderBottom: "1px solid var(--card-border)" }}>
              <td className="px-4 py-3" style={{ color: "rgba(var(--text-rgb),0.7)" }}>{e.sourceModule}</td>
              <td className="px-4 py-3" style={{ color: "rgba(var(--text-rgb),0.7)" }}>{e.sourceEventAction}</td>
              <td className="px-4 py-3 font-mono text-xs" style={{ color: "rgba(var(--text-rgb),0.6)" }}>{e.sourceRecordId}</td>
              <td className="px-4 py-3" style={{ color: e.status === "FAILED" ? "#ef4444" : "rgba(var(--text-rgb),0.7)" }}>{e.status}</td>
              <td className="px-4 py-3 text-xs" style={{ color: "rgba(var(--text-rgb),0.6)" }}>{e.failureReason ?? "—"}</td>
              <td className="px-4 py-3" style={{ color: "rgba(var(--text-rgb),0.6)" }}>{e.retryCount}</td>
              <td className="px-4 py-3">{(e.status === "FAILED" || e.status === "SKIPPED_NO_RULE") && <button type="button" onClick={() => retry(e.id)} disabled={pending} className="muv-os-btn-ghost rounded-lg px-2 py-1 text-xs" style={fieldStyle}>Retry</button>}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
