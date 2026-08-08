"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { resolveEscalation } from "@/actions/support";
import { useToast } from "@/components/ui/toast";

const cardStyle = { border: "1px solid var(--card-border)" } as const;

export function EscalationsManager({ escalations, byLevel }: { escalations: { id: string; ticketId: string; level: number; reason: string; triggerType: string; escalatedAt: Date }[]; byLevel: { level: number; count: number }[] }) {
  const router = useRouter();
  const { showToast } = useToast();
  const [pending, setPending] = useState(false);

  async function resolve(id: string) {
    setPending(true);
    const result = await resolveEscalation(id);
    setPending(false);
    if (!result.success) { showToast(result.error.message, { tone: "dark" }); return; }
    showToast("Escalation resolved", { tone: "dark" });
    router.refresh();
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {byLevel.map((b) => (
          <div key={b.level} className="muv-os-card rounded-2xl p-4" style={cardStyle}>
            <p className="text-xs" style={{ color: "rgba(var(--text-rgb),0.45)" }}>Level {b.level}</p>
            <p className="text-xl font-semibold mt-1">{b.count}</p>
          </div>
        ))}
      </div>
      <div className="overflow-x-auto rounded-2xl" style={cardStyle}>
        <table className="w-full text-sm">
          <thead><tr style={{ borderBottom: "1px solid var(--card-border)" }}>{["Ticket", "Level", "Trigger", "Reason", "Escalated At", "Action"].map((h) => <th key={h} className="px-4 py-3 text-left text-xs font-medium uppercase" style={{ color: "rgba(var(--text-rgb),0.45)" }}>{h}</th>)}</tr></thead>
          <tbody>
            {escalations.length === 0 ? <tr><td colSpan={6} className="px-4 py-8 text-center text-sm" style={{ color: "rgba(var(--text-rgb),0.45)" }}>No unresolved escalations.</td></tr> :
              escalations.map((e) => (
                <tr key={e.id} style={{ borderBottom: "1px solid var(--card-border)" }}>
                  <td className="px-4 py-3 font-mono text-xs"><Link href={`/os/support/tickets/${e.ticketId}`} style={{ color: "var(--lavender)" }}>{e.ticketId.slice(0, 10)}…</Link></td>
                  <td className="px-4 py-3" style={{ color: "rgba(var(--text-rgb),0.7)" }}>{e.level}</td>
                  <td className="px-4 py-3" style={{ color: "rgba(var(--text-rgb),0.7)" }}>{e.triggerType}</td>
                  <td className="px-4 py-3" style={{ color: "rgba(var(--text-rgb),0.7)" }}>{e.reason}</td>
                  <td className="px-4 py-3" style={{ color: "rgba(var(--text-rgb),0.7)" }}>{new Date(e.escalatedAt).toLocaleString()}</td>
                  <td className="px-4 py-3"><button type="button" onClick={() => resolve(e.id)} disabled={pending} className="muv-os-btn-ghost rounded-lg px-2 py-1 text-xs" style={cardStyle}>Resolve</button></td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
