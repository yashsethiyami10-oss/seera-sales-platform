import Link from "next/link";
import { Package, Building2, Clock3, ClipboardList } from "lucide-react";

type Card = {
  label: string;
  count: number;
  icon: typeof Package;
  params: Record<string, string | undefined>;
};

/**
 * Milestone 4 — Order Management OS. Same plain-Link-card pattern as
 * components/os-customers/CustomerSummaryCards.tsx — no client JS needed,
 * clicking navigates straight to the already-filtered, server-rendered list.
 */
export function OrderSummaryCards({
  counts,
  currentParams,
}: {
  counts: { directTotal: number; institutionalTotal: number; directOpen: number; institutionalOpen: number };
  currentParams: Record<string, string | undefined>;
}) {
  const cards: Card[] = [
    { label: "Direct Orders", count: counts.directTotal, icon: Package, params: { channel: undefined } },
    { label: "Business Orders", count: counts.institutionalTotal, icon: Building2, params: { channel: "INSTITUTIONAL" } },
    { label: "Direct — Open", count: counts.directOpen, icon: Clock3, params: { channel: "DIRECT" } },
    { label: "Business — Open", count: counts.institutionalOpen, icon: ClipboardList, params: { channel: "INSTITUTIONAL", status: "CONFIRMED" } },
  ];

  function isActive(card: Card): boolean {
    return (card.params.channel ?? "") === (currentParams.channel ?? "") && (card.params.status ?? "") === (currentParams.status ?? "");
  }

  function hrefFor(card: Card): string {
    const next = new URLSearchParams();
    for (const [key, value] of Object.entries(currentParams)) {
      if (key === "channel" || key === "status" || key === "page") continue;
      if (value) next.set(key, value);
    }
    if (card.params.channel) next.set("channel", card.params.channel);
    if (card.params.status) next.set("status", card.params.status);
    const qs = next.toString();
    return qs ? `/os/orders?${qs}` : "/os/orders";
  }

  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
      {cards.map((card) => {
        const Icon = card.icon;
        const active = isActive(card);
        return (
          <Link
            key={card.label}
            href={hrefFor(card)}
            aria-current={active ? "true" : undefined}
            className="muv-os-card flex flex-col gap-2 rounded-2xl p-3"
            style={{
              border: active ? "1px solid rgba(var(--lavender-rgb),0.5)" : "1px solid var(--card-border)",
              background: active ? "rgba(var(--lavender-rgb),0.08)" : "transparent",
            }}
          >
            <Icon size={16} style={{ color: active ? "var(--lavender)" : "rgba(var(--text-rgb),0.45)" }} />
            <div>
              <p className="text-lg font-semibold" style={{ color: "rgba(var(--text-rgb),0.95)" }}>{card.count}</p>
              <p className="text-xs" style={{ color: "rgba(var(--text-rgb),0.55)" }}>{card.label}</p>
            </div>
          </Link>
        );
      })}
    </div>
  );
}
