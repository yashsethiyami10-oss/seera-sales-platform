"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { getOrCreateVendorAccount, createAndPostVendorBill, requestVendorPayment } from "@/actions/finance";
import { useToast } from "@/components/ui/toast";

type Bill = { id: string; billNumber: string; status: string; totalAmount: number; outstandingAmount: number; dueDate: string };
type Vendor = { id: string; displayName: string };
type Account = { id: string; accountCode: string; name: string };

const fieldStyle = { border: "1px solid var(--card-border)", color: "rgba(var(--text-rgb),0.9)" } as const;

export function PayablesManager({ bills, vendors, expenseAccounts }: { bills: Bill[]; vendors: Vendor[]; expenseAccounts: Account[] }) {
  const router = useRouter();
  const { showToast } = useToast();
  const [pending, setPending] = useState(false);
  const [vendorId, setVendorId] = useState(vendors[0]?.id ?? "");
  const [supplierInvoiceNo, setSupplierInvoiceNo] = useState("");
  const [description, setDescription] = useState("");
  const [unitPrice, setUnitPrice] = useState(0);
  const [taxAmount, setTaxAmount] = useState(0);
  const [dueDate, setDueDate] = useState("");
  const [expenseAccountId, setExpenseAccountId] = useState(expenseAccounts[0]?.id ?? "");
  const [paymentVendorId, setPaymentVendorId] = useState(vendors[0]?.id ?? "");
  const [paymentAmount, setPaymentAmount] = useState(0);

  async function createBill() {
    if (!vendorId || !dueDate || !supplierInvoiceNo) { showToast("Vendor, supplier invoice number, and due date are required", { tone: "dark" }); return; }
    setPending(true);
    await getOrCreateVendorAccount({ vendorId });
    const now = new Date().toISOString();
    const result = await createAndPostVendorBill({ vendorId, supplierInvoiceNo, billDate: now, dueDate, taxAmount, lines: [{ description, unitPrice, accountId: expenseAccountId }] }, `ui:bill:${vendorId}:${Date.now()}`);
    setPending(false);
    if (!result.success) { showToast(result.error.message, { tone: "dark" }); return; }
    showToast(`Vendor bill ${result.data.billNumber} posted`, { tone: "dark" });
    router.refresh();
  }

  async function requestPayment() {
    setPending(true);
    await getOrCreateVendorAccount({ vendorId: paymentVendorId });
    const result = await requestVendorPayment({ vendorId: paymentVendorId, paymentDate: new Date().toISOString(), amount: paymentAmount });
    setPending(false);
    if (!result.success) { showToast(result.error.message, { tone: "dark" }); return; }
    showToast("Vendor payment requested — approve it to post", { tone: "dark" });
    router.refresh();
  }

  return (
    <div className="space-y-6">
      <div className="muv-os-card rounded-2xl p-4 space-y-3" style={{ border: "1px solid var(--card-border)" }}>
        <p className="text-sm font-medium" style={{ color: "rgba(var(--text-rgb),0.85)" }}>Post Purchase / Vendor Bill</p>
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
          <select value={vendorId} onChange={(e) => setVendorId(e.target.value)} className="muv-os-field rounded-lg px-2 py-1.5 text-xs bg-transparent" style={fieldStyle}>
            {vendors.map((v) => <option key={v.id} value={v.id}>{v.displayName}</option>)}
          </select>
          <input value={supplierInvoiceNo} onChange={(e) => setSupplierInvoiceNo(e.target.value)} placeholder="Supplier invoice #" className="muv-os-field rounded-lg px-2 py-1.5 text-xs bg-transparent" style={fieldStyle} />
          <input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Line description" className="muv-os-field rounded-lg px-2 py-1.5 text-xs bg-transparent" style={fieldStyle} />
          <input type="number" value={unitPrice} onChange={(e) => setUnitPrice(Number(e.target.value))} placeholder="Amount" className="muv-os-field rounded-lg px-2 py-1.5 text-xs bg-transparent" style={fieldStyle} />
          <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} className="muv-os-field rounded-lg px-2 py-1.5 text-xs bg-transparent" style={fieldStyle} />
        </div>
        <select value={expenseAccountId} onChange={(e) => setExpenseAccountId(e.target.value)} className="muv-os-field rounded-lg px-2 py-1.5 text-xs bg-transparent" style={fieldStyle}>
          {expenseAccounts.map((a) => <option key={a.id} value={a.id}>{a.accountCode} — {a.name}</option>)}
        </select>
        <button type="button" onClick={createBill} disabled={pending} className="muv-os-btn-primary rounded-lg px-3 py-1.5 text-xs disabled:opacity-60" style={{ background: "var(--lavender)", color: "#0b0b0f" }}>Post Bill</button>
      </div>

      <div className="muv-os-card rounded-2xl p-4 space-y-3" style={{ border: "1px solid var(--card-border)" }}>
        <p className="text-sm font-medium" style={{ color: "rgba(var(--text-rgb),0.85)" }}>Request Vendor Payment</p>
        <div className="grid grid-cols-3 gap-2">
          <select value={paymentVendorId} onChange={(e) => setPaymentVendorId(e.target.value)} className="muv-os-field rounded-lg px-2 py-1.5 text-xs bg-transparent" style={fieldStyle}>
            {vendors.map((v) => <option key={v.id} value={v.id}>{v.displayName}</option>)}
          </select>
          <input type="number" value={paymentAmount} onChange={(e) => setPaymentAmount(Number(e.target.value))} placeholder="Amount" className="muv-os-field rounded-lg px-2 py-1.5 text-xs bg-transparent" style={fieldStyle} />
          <button type="button" onClick={requestPayment} disabled={pending} className="muv-os-btn-ghost rounded-lg px-3 py-1.5 text-xs" style={fieldStyle}>Request Payment</button>
        </div>
        <p className="text-xs" style={{ color: "rgba(var(--text-rgb),0.45)" }}>Approval (Finance Manager+, maker-checker enforced) happens separately — see the Journals/Reports pages for pending approvals, or approve via API.</p>
      </div>

      <div className="overflow-x-auto rounded-2xl" style={{ border: "1px solid var(--card-border)" }}>
        <table className="w-full text-sm">
          <thead><tr style={{ borderBottom: "1px solid var(--card-border)" }}>
            {["Bill #", "Status", "Total", "Outstanding", "Due Date"].map((h) => <th key={h} className="px-4 py-3 text-left text-xs font-medium uppercase" style={{ color: "rgba(var(--text-rgb),0.45)" }}>{h}</th>)}
          </tr></thead>
          <tbody>
            {bills.length === 0 ? (
              <tr><td colSpan={5} className="px-4 py-8 text-center text-sm" style={{ color: "rgba(var(--text-rgb),0.45)" }}>No vendor bills yet.</td></tr>
            ) : bills.map((b) => (
              <tr key={b.id} style={{ borderBottom: "1px solid var(--card-border)" }}>
                <td className="px-4 py-3 font-mono text-xs" style={{ color: "rgba(var(--text-rgb),0.9)" }}>{b.billNumber}</td>
                <td className="px-4 py-3" style={{ color: "rgba(var(--text-rgb),0.7)" }}>{b.status}</td>
                <td className="px-4 py-3" style={{ color: "rgba(var(--text-rgb),0.7)" }}>₹{b.totalAmount.toLocaleString("en-IN")}</td>
                <td className="px-4 py-3" style={{ color: b.outstandingAmount > 0 ? "#ef4444" : "#22c55e" }}>₹{b.outstandingAmount.toLocaleString("en-IN")}</td>
                <td className="px-4 py-3" style={{ color: "rgba(var(--text-rgb),0.6)" }}>{new Date(b.dueDate).toLocaleDateString("en-IN")}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
