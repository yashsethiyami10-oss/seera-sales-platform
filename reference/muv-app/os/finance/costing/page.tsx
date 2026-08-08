import { Workspace } from "@/components/os-shell/Workspace/Workspace";
import { PageHeader } from "@/components/os-shell/Workspace/PageHeader";
import { SectionHeader } from "@/components/os-shell/primitives/SectionHeader";
import { listBatchCosts, getInventoryValuation } from "@/actions/finance";

export default async function CostingPage() {
  const [batchCostsResult, valuationResult] = await Promise.all([listBatchCosts({ pageSize: 50 }), getInventoryValuation()]);
  return (
    <Workspace>
      <PageHeader title="Manufacturing Costing" description="Direct material is derived automatically from real consumption at standard cost; other components are recorded manually via recordAdditionalBatchCost" />
      <div className="px-6 pb-10 space-y-6">
        <section>
          <SectionHeader title="Batch Costs" />
          <div className="mt-3 overflow-x-auto rounded-2xl" style={{ border: "1px solid var(--card-border)" }}>
            <table className="w-full text-sm">
              <thead><tr style={{ borderBottom: "1px solid var(--card-border)" }}>{["Batch", "Method", "Direct Material", "Total Cost", "Cost/Unit"].map((h) => <th key={h} className="px-4 py-3 text-left text-xs font-medium uppercase" style={{ color: "rgba(var(--text-rgb),0.45)" }}>{h}</th>)}</tr></thead>
              <tbody>
                {!batchCostsResult.success || batchCostsResult.data.items.length === 0 ? (
                  <tr><td colSpan={5} className="px-4 py-8 text-center text-sm" style={{ color: "rgba(var(--text-rgb),0.45)" }}>No batch costs recorded yet — costs are recorded automatically when a batch transfers to Finished Goods.</td></tr>
                ) : batchCostsResult.data.items.map((c) => (
                  <tr key={c.id} style={{ borderBottom: "1px solid var(--card-border)" }}>
                    <td className="px-4 py-3 font-mono text-xs" style={{ color: "rgba(var(--text-rgb),0.9)" }}>{c.batchId}</td>
                    <td className="px-4 py-3" style={{ color: "rgba(var(--text-rgb),0.7)" }}>{c.costingMethod}</td>
                    <td className="px-4 py-3" style={{ color: "rgba(var(--text-rgb),0.7)" }}>₹{Number(c.directMaterialCost).toLocaleString("en-IN")}</td>
                    <td className="px-4 py-3" style={{ color: "rgba(var(--text-rgb),0.7)" }}>₹{Number(c.totalCost).toLocaleString("en-IN")}</td>
                    <td className="px-4 py-3" style={{ color: "rgba(var(--text-rgb),0.7)" }}>{c.costPerUnit ? Number(c.costPerUnit).toFixed(2) : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
        <section>
          <SectionHeader title="Inventory Valuation" />
          {valuationResult.success ? (
            <div className="mt-3 overflow-x-auto rounded-2xl" style={{ border: "1px solid var(--card-border)" }}>
              <table className="w-full text-sm">
                <thead><tr style={{ borderBottom: "1px solid var(--card-border)" }}>{["SKU", "Product", "Quantity", "Unit Cost", "Value"].map((h) => <th key={h} className="px-4 py-3 text-left text-xs font-medium uppercase" style={{ color: "rgba(var(--text-rgb),0.45)" }}>{h}</th>)}</tr></thead>
                <tbody>
                  {valuationResult.data.rows.map((r) => (
                    <tr key={r.variantId} style={{ borderBottom: "1px solid var(--card-border)" }}>
                      <td className="px-4 py-3 font-mono text-xs" style={{ color: "rgba(var(--text-rgb),0.9)" }}>{r.sku}</td>
                      <td className="px-4 py-3" style={{ color: "rgba(var(--text-rgb),0.7)" }}>{r.productName}</td>
                      <td className="px-4 py-3" style={{ color: "rgba(var(--text-rgb),0.7)" }}>{r.quantity}</td>
                      <td className="px-4 py-3" style={{ color: "rgba(var(--text-rgb),0.7)" }}>₹{r.unitCost.toLocaleString("en-IN")}</td>
                      <td className="px-4 py-3" style={{ color: "rgba(var(--text-rgb),0.7)" }}>₹{r.value.toLocaleString("en-IN")}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="px-4 py-3 text-sm font-medium" style={{ color: "rgba(var(--text-rgb),0.85)" }}>Total: ₹{valuationResult.data.totalValue.toLocaleString("en-IN")}</p>
            </div>
          ) : <p className="text-sm" style={{ color: "rgba(var(--text-rgb),0.6)" }}>{valuationResult.error.message}</p>}
        </section>
      </div>
    </Workspace>
  );
}
