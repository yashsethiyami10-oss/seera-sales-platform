import Link from "next/link";
import { Users, Building2, User, Truck, Store, ShoppingBag, UserX } from "lucide-react";

type Card = {
  label: string;
  count: number;
  icon: typeof Users;
  /** Search params this card sets when clicked — merged onto the current filters, replacing customerTypeId/active/q. */
  params: Record<string, string | undefined>;
};

/**
 * MUV OS™ — Milestone 2 refinement, Customer Dashboard summary cards.
 * Plain links (no client JS needed) — clicking instantly navigates to the
 * already-existing, server-rendered filtered list, the same "instant"
 * mechanism `CustomerFilters` already uses. `isActive` compares against
 * the current URL so the selected card stays visually distinct.
 */
export function CustomerSummaryCards({
  counts,
  customerTypeIdByName,
  currentParams,
}: {
  counts: { all: number; inactive: number; byType: Record<string, number> };
  customerTypeIdByName: Record<string, string>;
  currentParams: Record<string, string | undefined>;
}) {
  const cards: Card[] = [
    { label: "All Customers", count: counts.all, icon: Users, params: { customerTypeId: undefined, active: undefined } },
    { label: "Institutional", count: counts.byType.Institutional ?? 0, icon: Building2, params: { customerTypeId: customerTypeIdByName.Institutional, active: "true" } },
    { label: "Individual", count: counts.byType.Individual ?? 0, icon: User, params: { customerTypeId: customerTypeIdByName.Individual, active: "true" } },
    { label: "Distributor", count: counts.byType.Distributor ?? 0, icon: Truck, params: { customerTypeId: customerTypeIdByName.Distributor, active: "true" } },
    { label: "Dealer", count: counts.byType.Dealer ?? 0, icon: Store, params: { customerTypeId: customerTypeIdByName.Dealer, active: "true" } },
    { label: "Retailer", count: counts.byType.Retailer ?? 0, icon: ShoppingBag, params: { customerTypeId: customerTypeIdByName.Retailer, active: "true" } },
    { label: "Inactive", count: counts.inactive, icon: UserX, params: { customerTypeId: undefined, active: "false" } },
  ];

  function isActive(card: Card): boolean {
    const wantsType = card.params.customerTypeId;
    const wantsActive = card.params.active;
    const currentType = currentParams.customerTypeId;
    const currentActive = currentParams.active;
    if (wantsType === undefined && wantsActive === undefined) return !currentType && !currentActive;
    return (wantsType ?? "") === (currentType ?? "") && (wantsActive ?? "") === (currentActive ?? "");
  }

  function hrefFor(card: Card): string {
    const next = new URLSearchParams();
    for (const [key, value] of Object.entries(currentParams)) {
      if (key === "customerTypeId" || key === "active" || key === "page") continue;
      if (value) next.set(key, value);
    }
    if (card.params.customerTypeId) next.set("customerTypeId", card.params.customerTypeId);
    if (card.params.active) next.set("active", card.params.active);
    const qs = next.toString();
    return qs ? `/os/customers?${qs}` : "/os/customers";
  }

  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3">
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
