"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { getOrCreateCustomerAccount, createAndIssueReceivableInvoice, recordCustomerReceipt } from "@/actions/finance";
import { useToast } from "@/components/ui/toast";

type Invoice = { id: string; invoiceNumber: string; status: string; totalAmount: number; outstandingAmount: number; dueDate: string };
type Customer = { id: string; name: string };
type Account = { id: string; accountCode: string; name: string };

const fieldStyle = { border: "1px solid var(--card-border)", color: "rgba(var(--text-rgb),0.9)" } as const;

export function ReceivablesManager({ invoices, customers, revenueAccounts }: { invoices: Invoice[]; customers: Customer[]; revenueAccounts: Account[] }) {
  const router = useRouter();
  const { showToast } = useToast();
  const [pending, setPending] = useState(false);
  const [customerId, setCustomerId] = useState(customers[0]?.id ?? "");
  const [description, setDescription] = useState("");
  const [unitPrice, setUnitPrice] = useState(0);
  const [taxAmount, setTaxAmount] = useState(0);
  const [dueDate, setDueDate] = useState("");
  const [revenueAccountId, setRevenueAccountId] = useState(revenueAccounts[0]?.id ?? "");
  const [receiptCustomerId, setReceiptCustomerId] = useState(customers[0]?.id ?? "");
  const [receiptAmount, setReceiptAmount] = useState(0);

  async function ensureAccount(id: string) {
    await getOrCreateCustomerAccount({ customerId: id });
  }

  async function issueInvoice() {
    if (!customerId || !dueDate) { showToast("Customer and due date are required", { tone: "dark" }); return; }
    setPending(true);
    await ensureAccount(customerId);
    const now = new Date().toISOString();
    const result = await createAndIssueReceivableInvoice({
      customerId, issueDate: now, dueDate, taxAmount, lines: [{ description, unitPrice, accountId: revenueAccountId }],
    }, `ui:invoice:${customerId}:${Date.now()}`);
    setPending(false);
    if (!result.success) { showToast(result.error.message, { tone: "dark" }); return; }
    showToast(`Invoice ${result.data.invoiceNumber} issued`, { tone: "dark" });
    router.refresh();
  }

  async function recordReceipt() {
    setPending(true);
    await ensureAccount(receiptCustomerId);
    const result = await recordCustomerReceipt({ customerId: receiptCustomerId, receiptDate: new Date().toISOString(), amount: receiptAmount }, `ui:receipt:${receiptCustomerId}:${Date.now()}`);
    setPending(false);
    if (!result.success) { showToast(result.error.message, { tone: "dark" }); return; }
    showToast(`Receipt ${result.data.receiptNumber} recorded — allocate it below`, { tone: "dark" });
    router.refresh();
  }

  return (
    <div className="space-y-6">
      <div className="muv-os-card rounded-2xl p-4 space-y-3" style={{ border: "1px solid var(--card-border)" }}>
        <p className="text-sm font-medium" style={{ color: "rgba(var(--text-rgb),0.85)" }}>Issue Sales Invoice</p>
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
          <select value={customerId} onChange={(e) => setCustomerId(e.target.value)} className="muv-os-field rounded-lg px-2 py-1.5 text-xs bg-transparent" style={fieldStyle}>
            {customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Line description" className="muv-os-field rounded-lg px-2 py-1.5 text-xs bg-transparent" style={fieldStyle} />
          <input type="number" value={unitPrice} onChange={(e) => setUnitPrice(Number(e.target.value))} placeholder="Amount" className="muv-os-field rounded-lg px-2 py-1.5 text-xs bg-transparent" style={fieldStyle} />
          <input type="number" value={taxAmount} onChange={(e) => setTaxAmount(Number(e.target.value))} placeholder="Tax" className="muv-os-field rounded-lg px-2 py-1.5 text-xs bg-transparent" style={fieldStyle} />
          <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} className="muv-os-field rounded-lg px-2 py-1.5 text-xs bg-transparent" style={fieldStyle} />
        </div>
        <select value={revenueAccountId} onChange={(e) => setRevenueAccountId(e.target.value)} className="muv-os-field rounded-lg px-2 py-1.5 text-xs bg-transparent" style={fieldStyle}>
          {revenueAccounts.map((a) => <option key={a.id} value={a.id}>{a.accountCode} — {a.name}</option>)}
        </select>
        <button type="button" onClick={issueInvoice} disabled={pending} className="muv-os-btn-primary rounded-lg px-3 py-1.5 text-xs disabled:opacity-60" style={{ background: "var(--lavender)", color: "#0b0b0f" }}>Issue Invoice</button>
      </div>

      <div className="muv-os-card rounded-2xl p-4 space-y-3" style={{ border: "1px solid var(--card-border)" }}>
        <p className="text-sm font-medium" style={{ color: "rgba(var(--text-rgb),0.85)" }}>Record Customer Receipt</p>
        <div className="grid grid-cols-3 gap-2">
          <select value={receiptCustomerId} onChange={(e) => setReceiptCustomerId(e.target.value)} className="muv-os-field rounded-lg px-2 py-1.5 text-xs bg-transparent" style={fieldStyle}>
            {customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <input type="number" value={receiptAmount} onChange={(e) => setReceiptAmount(Number(e.target.value))} placeholder="Amount" className="muv-os-field rounded-lg px-2 py-1.5 text-xs bg-transparent" style={fieldStyle} />
          <button type="button" onClick={recordReceipt} disabled={pending} className="muv-os-btn-ghost rounded-lg px-3 py-1.5 text-xs" style={fieldStyle}>Record Receipt</button>
        </div>
      </div>

      <div className="overflow-x-auto rounded-2xl" style={{ border: "1px solid var(--card-border)" }}>
        <table className="w-full text-sm">
          <thead><tr style={{ borderBottom: "1px solid var(--card-border)" }}>
            {["Invoice #", "Status", "Total", "Outstanding", "Due Date"].map((h) => <th key={h} className="px-4 py-3 text-left text-xs font-medium uppercase" style={{ color: "rgba(var(--text-rgb),0.45)" }}>{h}</th>)}
          </tr></thead>
          <tbody>
            {invoices.length === 0 ? (
              <tr><td colSpan={5} className="px-4 py-8 text-center text-sm" style={{ color: "rgba(var(--text-rgb),0.45)" }}>No invoices yet.</td></tr>
            ) : invoices.map((i) => (
              <tr key={i.id} style={{ borderBottom: "1px solid var(--card-border)" }}>
                <td className="px-4 py-3 font-mono text-xs" style={{ color: "rgba(var(--text-rgb),0.9)" }}>{i.invoiceNumber}</td>
                <td className="px-4 py-3" style={{ color: "rgba(var(--text-rgb),0.7)" }}>{i.status}</td>
                <td className="px-4 py-3" style={{ color: "rgba(var(--text-rgb),0.7)" }}>₹{i.totalAmount.toLocaleString("en-IN")}</td>
                <td className="px-4 py-3" style={{ color: i.outstandingAmount > 0 ? "#ef4444" : "#22c55e" }}>₹{i.outstandingAmount.toLocaleString("en-IN")}</td>
                <td className="px-4 py-3" style={{ color: "rgba(var(--text-rgb),0.6)" }}>{new Date(i.dueDate).toLocaleDateString("en-IN")}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
