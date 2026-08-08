import { Workspace } from "@/components/os-shell/Workspace/Workspace";
import { PageHeader } from "@/components/os-shell/Workspace/PageHeader";
import { listTerritories } from "@/actions/territories";
import { TerritoryCreateForm } from "@/components/os-territories/TerritoryCreateForm";

const LEVEL_COLOR: Record<string, string> = {
  STATE: "rgba(var(--lavender-rgb),0.9)",
  CITY: "rgba(var(--lavender-rgb),0.7)",
  AREA: "rgba(var(--lavender-rgb),0.5)",
  TERRITORY: "rgba(var(--text-rgb),0.5)",
};

// Two-step extraction: a conditional type only distributes over a union
// when the checked type is a bare type parameter — `ListResult` here is
// that parameter, so `ExtractData<ListResult>` correctly picks out just
// the `{ success: true }` member's `data` instead of collapsing to `never`
// (which is what happens when the union+conditional are combined in one step).
type ListResult = Awaited<ReturnType<typeof listTerritories>>;
type ExtractData<T> = T extends { success: true; data: infer D } ? D : never;
type TerritoryRow = ExtractData<ListResult>[number];

/**
 * MUV OS™ — Milestone 2 refinement, Territory hierarchy readability
 * (§7). Same flat table and data model as before (per the brief's own
 * "otherwise keep the implementation") — improved by depth-first
 * ordering + indentation, so State → City → Area → Territory reads as a
 * tree instead of an unordered list a viewer has to mentally reassemble
 * from the Parent column alone.
 */
function orderHierarchically(items: TerritoryRow[]): { item: TerritoryRow; depth: number }[] {
  const byParent = new Map<string | null, TerritoryRow[]>();
  for (const item of items) {
    const key = item.parentTerritoryId;
    byParent.set(key, [...(byParent.get(key) ?? []), item]);
  }
  for (const list of byParent.values()) list.sort((a, b) => a.name.localeCompare(b.name));

  const result: { item: TerritoryRow; depth: number }[] = [];
  function visit(parentId: string | null, depth: number) {
    for (const item of byParent.get(parentId) ?? []) {
      result.push({ item, depth });
      visit(item.id, depth + 1);
    }
  }
  visit(null, 0);
  return result;
}

export default async function TerritoriesPage() {
  const result = await listTerritories();
  const items = result.success ? result.data : [];
  const ordered = orderHierarchically(items);

  return (
    <Workspace>
      <PageHeader title="Territories" description="State, City, Area, and Territory — one hierarchy" />
      <div className="px-6 space-y-4">
        <TerritoryCreateForm territories={items.map((t) => ({ id: t.id, name: t.name }))} />

        <div className="overflow-x-auto rounded-2xl" style={{ border: "1px solid var(--card-border)" }}>
          <table className="w-full text-sm">
            <thead>
              <tr style={{ borderBottom: "1px solid var(--card-border)" }}>
                {["Name", "Level", "Code", "Customers", "Users", "Status"].map((h) => (
                  <th key={h} className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide" style={{ color: "rgba(var(--text-rgb),0.45)" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {ordered.length === 0 ? (
                <tr><td colSpan={6} className="px-4 py-10 text-center text-sm" style={{ color: "rgba(var(--text-rgb),0.45)" }}>No territories yet — use &ldquo;New Territory&rdquo; above to create the first one.</td></tr>
              ) : (
                ordered.map(({ item: t, depth }) => (
                  <tr key={t.id} className="muv-os-row" style={{ borderBottom: "1px solid var(--card-border)" }}>
                    <td className="px-4 py-3" style={{ color: "rgba(var(--text-rgb),0.9)", paddingLeft: `${16 + depth * 20}px` }}>
                      {depth > 0 && <span style={{ color: "rgba(var(--text-rgb),0.3)" }}>└ </span>}
                      {t.name}
                    </td>
                    <td className="px-4 py-3">
                      <span className="rounded-full px-2 py-0.5 text-xs" style={{ border: `1px solid ${LEVEL_COLOR[t.level] ?? "var(--card-border)"}`, color: LEVEL_COLOR[t.level] ?? "rgba(var(--text-rgb),0.6)" }}>
                        {t.level}
                      </span>
                    </td>
                    <td className="px-4 py-3" style={{ color: "rgba(var(--text-rgb),0.55)" }}>{t.code}</td>
                    <td className="px-4 py-3" style={{ color: "rgba(var(--text-rgb),0.7)" }}>{t._count.customers}</td>
                    <td className="px-4 py-3" style={{ color: "rgba(var(--text-rgb),0.7)" }}>{t._count.users}</td>
                    <td className="px-4 py-3">
                      <span className="rounded-full px-2 py-0.5 text-xs" style={{ background: t.active ? "rgba(var(--lavender-rgb),0.12)" : "rgba(239,68,68,0.12)", color: t.active ? "var(--lavender)" : "#ef4444" }}>
                        {t.active ? "Active" : "Inactive"}
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </Workspace>
  );
}
