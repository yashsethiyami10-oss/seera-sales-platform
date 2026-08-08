type TimelineEvent = { id: string; label: string; actorName: string; createdAt: Date | string; detail: unknown };

/**
 * Milestone 4 — Order Management OS. Read-only, server-fetched — no client
 * state, matching CustomerDetailTabs's existing "Timeline/Audit" tab
 * pattern. Renders SalesAuditLog rows already given human-readable labels
 * by getBusinessOrderTimeline (actions/business-orders.ts), not raw JSON.
 */
export function BusinessOrderTimeline({ events }: { events: TimelineEvent[] }) {
  if (events.length === 0) {
    return <p className="text-sm" style={{ color: "rgba(var(--text-rgb),0.45)" }}>No activity recorded yet.</p>;
  }
  return (
    <ol className="space-y-3">
      {events.map((e) => (
        <li key={e.id} className="flex items-start gap-3 text-sm">
          <span className="mt-1.5 h-1.5 w-1.5 flex-shrink-0 rounded-full" style={{ background: "var(--lavender)" }} />
          <div>
            <p style={{ color: "rgba(var(--text-rgb),0.85)" }}>{e.label}</p>
            <p className="text-xs" style={{ color: "rgba(var(--text-rgb),0.45)" }}>
              {e.actorName} · {new Date(e.createdAt).toLocaleString("en-IN")}
            </p>
          </div>
        </li>
      ))}
    </ol>
  );
}
