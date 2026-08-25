// SEERA COST CENTRE — a pure, read-only DERIVED label, not a stored field. Founder closure pass
// (24-Aug §8-9): "do not duplicate Territory... reuse a Cost Centre abstraction only for
// non-territorial allocation... do not require both." Adding a real `costCentreId` column would
// mean a schema migration on top of an already-large pass; every example the spec gives (Meta Ads
// -> Corporate, Head Office Rent -> Head Office, Factory Raw Material -> Manufacturing) is fully
// derivable from data ALREADY on the expense (its category's parentGroup) without asking anyone to
// pick a Cost Centre a second time. When a real Territory is already set, Cost Centre is
// deliberately not shown at all — Territory already answers "where," so showing both would be the
// same "asked twice" problem the spec explicitly forbids.
//
// Known honest limitation: a pure category-based derivation cannot distinguish "Warehouse
// Electricity" from "Head Office Electricity" — both are code 5140, grouped FACTORY today — so
// Electricity currently resolves to Manufacturing rather than Warehouse. Flagged, not silently
// claimed as fully solved; a real fix would need a genuine location-aware field, out of scope here.

export type CostCentre = "Corporate" | "Head Office" | "Warehouse" | "Manufacturing";
export const COST_CENTRES: CostCentre[] = ["Corporate", "Head Office", "Warehouse", "Manufacturing"];

const WAREHOUSE_CODES = new Set(["5030"]); // Warehousing
const MANUFACTURING_CODES = new Set(["5000", "5001", "5010", "5032", "5240"]); // Raw Material, COGS, Packaging, Factory Operating Expense, Wastage
const MANUFACTURING_GROUPS = new Set(["FACTORY", "PURCHASE_OPERATIONS"]);
const HEAD_OFFICE_GROUPS = new Set(["ADMIN_OFFICE", "LABOUR_STAFF"]);
const WAREHOUSE_GROUPS = new Set(["TRANSPORT_LOGISTICS"]);

export function deriveCostCentre(category: { chartOfAccountId?: string | null; parentGroup?: string | null } | null | undefined, hasTerritory: boolean): CostCentre | null {
  if (hasTerritory) return null;
  if (!category) return "Corporate";
  const code = category.chartOfAccountId ?? "";
  const group = category.parentGroup ?? "";
  if (WAREHOUSE_CODES.has(code) || WAREHOUSE_GROUPS.has(group)) return "Warehouse";
  if (MANUFACTURING_CODES.has(code) || MANUFACTURING_GROUPS.has(group)) return "Manufacturing";
  if (HEAD_OFFICE_GROUPS.has(group)) return "Head Office";
  return "Corporate";
}
