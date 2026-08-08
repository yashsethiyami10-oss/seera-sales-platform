/** Institutional Sales OS — shared stat tile for the three role dashboards. */
export function MetricCard({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div className="muv-os-card rounded-2xl p-4" style={{ border: "1px solid var(--card-border)" }}>
      <p className="text-xs" style={{ color: "rgba(var(--text-rgb),0.55)" }}>{label}</p>
      <p className="mt-1 text-2xl font-semibold" style={{ color: "rgba(var(--text-rgb),0.95)" }}>{value}</p>
      {sub && <p className="mt-0.5 text-xs" style={{ color: "rgba(var(--text-rgb),0.45)" }}>{sub}</p>}
    </div>
  );
}
