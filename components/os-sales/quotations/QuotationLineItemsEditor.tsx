"use client";

type Product = { id: string; name: string; gstRate: number; variants: { id: string; size: string; price: number }[] };
export type LineRow = { productId: string; variantId: string; quantity: number; unitPrice: number; discountPercent: number };

/** Shared row editor for creating a quotation and revising one — the same line-item shape either way. */
export function QuotationLineItemsEditor({ products, rows, onChange }: { products: Product[]; rows: LineRow[]; onChange: (rows: LineRow[]) => void }) {
  function update(index: number, patch: Partial<LineRow>) {
    const next = rows.map((r, i) => (i === index ? { ...r, ...patch } : r));
    onChange(next);
  }

  function addRow() {
    const first = products[0];
    onChange([...rows, { productId: first?.id ?? "", variantId: "", quantity: 1, unitPrice: first?.variants[0]?.price ?? 0, discountPercent: 0 }]);
  }

  function removeRow(index: number) {
    onChange(rows.filter((_, i) => i !== index));
  }

  const field = "muv-os-field rounded-lg px-2 py-1.5 text-sm bg-transparent w-full";
  const fieldStyle = { border: "1px solid var(--card-border)", color: "rgba(var(--text-rgb),0.9)" } as const;

  const totals = rows.reduce(
    (acc, r) => {
      const product = products.find((p) => p.id === r.productId);
      const subtotal = r.quantity * r.unitPrice;
      const discount = subtotal * (r.discountPercent / 100);
      const taxable = subtotal - discount;
      const tax = taxable * ((product?.gstRate ?? 0) / 100);
      return { subtotal: acc.subtotal + subtotal, discount: acc.discount + discount, tax: acc.tax + tax, total: acc.total + taxable + tax };
    },
    { subtotal: 0, discount: 0, tax: 0, total: 0 }
  );

  return (
    <div className="space-y-3">
      <div className="overflow-x-auto rounded-xl" style={{ border: "1px solid var(--card-border)" }}>
        <table className="w-full text-sm">
          <thead>
            <tr style={{ borderBottom: "1px solid var(--card-border)" }}>
              {["Product", "Variant", "Qty", "Unit Price", "Discount %", "Line Est.", ""].map((h) => <th key={h} className="px-2 py-2 text-left text-xs font-medium" style={{ color: "rgba(var(--text-rgb),0.45)" }}>{h}</th>)}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, index) => {
              const product = products.find((p) => p.id === row.productId);
              const subtotal = row.quantity * row.unitPrice;
              const discount = subtotal * (row.discountPercent / 100);
              const taxable = subtotal - discount;
              const lineTotal = taxable + taxable * ((product?.gstRate ?? 0) / 100);
              return (
                <tr key={index} style={{ borderBottom: "1px solid var(--card-border)" }}>
                  <td className="px-2 py-1.5">
                    <select value={row.productId} onChange={(e) => { const p = products.find((pp) => pp.id === e.target.value); update(index, { productId: e.target.value, variantId: "", unitPrice: p?.variants[0]?.price ?? row.unitPrice }); }} className={field} style={fieldStyle}>
                      {products.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                    </select>
                  </td>
                  <td className="px-2 py-1.5">
                    <select value={row.variantId} onChange={(e) => update(index, { variantId: e.target.value })} className={field} style={fieldStyle}>
                      <option value="">—</option>
                      {product?.variants.map((v) => <option key={v.id} value={v.id}>{v.size}</option>)}
                    </select>
                  </td>
                  <td className="px-2 py-1.5"><input type="number" min={1} value={row.quantity} onChange={(e) => update(index, { quantity: Number(e.target.value) })} className={field} style={{ ...fieldStyle, width: 70 }} /></td>
                  <td className="px-2 py-1.5"><input type="number" min={0} value={row.unitPrice} onChange={(e) => update(index, { unitPrice: Number(e.target.value) })} className={field} style={{ ...fieldStyle, width: 90 }} /></td>
                  <td className="px-2 py-1.5"><input type="number" min={0} max={100} value={row.discountPercent} onChange={(e) => update(index, { discountPercent: Number(e.target.value) })} className={field} style={{ ...fieldStyle, width: 70 }} /></td>
                  <td className="px-2 py-1.5" style={{ color: "rgba(var(--text-rgb),0.75)" }}>₹{lineTotal.toFixed(2)}</td>
                  <td className="px-2 py-1.5"><button type="button" onClick={() => removeRow(index)} className="text-xs" style={{ color: "#ef4444" }}>Remove</button></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <button type="button" onClick={addRow} className="muv-os-btn-ghost rounded-lg px-3 py-1.5 text-sm" style={{ border: "1px solid var(--card-border)", color: "var(--lavender)" }}>+ Add Line</button>
      <div className="text-sm text-right space-y-0.5" style={{ color: "rgba(var(--text-rgb),0.7)" }}>
        <p>Subtotal: ₹{totals.subtotal.toFixed(2)}</p>
        <p>Discount: -₹{totals.discount.toFixed(2)}</p>
        <p>Tax: ₹{totals.tax.toFixed(2)}</p>
        <p className="font-semibold" style={{ color: "rgba(var(--text-rgb),0.95)" }}>Grand Total: ₹{totals.total.toFixed(2)}</p>
      </div>
    </div>
  );
}
