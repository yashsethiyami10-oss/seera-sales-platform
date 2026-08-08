import { Check } from "lucide-react";

const STAGES = [
  { key: "PLACED", label: "Order Confirmed" },
  { key: "PACKED", label: "Packed" },
  { key: "SHIPPED", label: "Shipped" },
  { key: "OUT_FOR_DELIVERY", label: "Out for Delivery" },
  { key: "DELIVERED", label: "Delivered" },
] as const;

/**
 * Real, driven by `Order.status` — not the decorative "architecture only"
 * timeline the brief permitted. The status enum already has exactly these
 * values (checked prisma/schema.prisma), so there was no honest reason to
 * fake it. CANCELLED/RETURN_REQUESTED/RETURNED render their own distinct
 * state rather than being forced into this forward-only progression, since
 * showing a cancelled order as "3 of 5 steps complete" would misrepresent
 * what actually happened. No "Preparing" stage — the brief's example list
 * includes one, but there's no distinct backend status for it; PLACED
 * already covers "confirmed and being prepared," and inventing a second
 * fake step between two real ones would be exactly the kind of fabricated
 * state this project has consistently avoided.
 */
export function OrderTimeline({ status }: { status: string }) {
  if (status === "CANCELLED") {
    return (
      <div className="muv-card text-center py-8">
        <p className="muv-text-solid text-sm font-medium">This order was cancelled</p>
      </div>
    );
  }

  if (status === "RETURN_REQUESTED" || status === "RETURNED") {
    return (
      <div className="muv-card text-center py-8">
        <p className="muv-text-solid text-sm font-medium">{status === "RETURNED" ? "This order was returned" : "Return requested"}</p>
      </div>
    );
  }

  const currentIndex = STAGES.findIndex((s) => s.key === status);

  return (
    <div className="flex items-center justify-between overflow-x-auto py-2" role="list" aria-label="Order progress">
      {STAGES.map((stage, i) => {
        const done = currentIndex >= 0 && i <= currentIndex;
        const isCurrent = i === currentIndex;
        return (
          <div key={stage.key} className="flex items-center flex-1 min-w-[90px]" role="listitem" aria-current={isCurrent ? "step" : undefined}>
            <div className="flex flex-col items-center flex-shrink-0" style={{ minWidth: 90 }}>
              <div
                className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0"
                style={{ background: done ? "var(--lavender)" : "rgba(120,120,130,0.2)", color: done ? "#0b0b0f" : "rgba(var(--text-rgb),0.4)" }}
                aria-hidden
              >
                {done ? <Check size={14} /> : <span className="text-xs">{i + 1}</span>}
              </div>
              <span className={`text-[11px] mt-2 text-center ${isCurrent ? "muv-text-solid font-medium" : "muv-text-meta"}`}>{stage.label}</span>
            </div>
            {i < STAGES.length - 1 && <div className="h-px flex-1" style={{ background: i < currentIndex ? "var(--lavender)" : "var(--hairline)" }} aria-hidden />}
          </div>
        );
      })}
    </div>
  );
}
