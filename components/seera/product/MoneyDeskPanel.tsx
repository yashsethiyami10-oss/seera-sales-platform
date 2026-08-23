"use client";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import styles from "./WorkflowActions.module.css";

const key = () => crypto.randomUUID();
async function post(action: string, payload: unknown) {
  const r = await fetch("/api/finance/company-operations", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, payload }) });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d?.error?.message ?? d?.error?.code ?? "Action failed");
  return d;
}
const money = (v: number | string | null | undefined) => `₹${Math.round(Number(v ?? 0)).toLocaleString("en-IN")}`;

type Direction = "CASH_IN" | "CASH_OUT" | "BANK_IN" | "BANK_OUT" | "ADJUSTMENT";
type PurposeDef = {
  code: string;
  label: string;
  hindiLabel: string;
  allowedDirections: Direction[];
  requiredFields: string[];
  optionalFields: string[];
  documentPolicy: "REQUIRED" | "OPTIONAL" | "NONE";
  description: string;
};
type SupportingData = {
  treasuryAccounts: { id: string; name: string; kind: string; coaCode: string }[];
  vendors: { id: string; name: string }[];
  materials: { id: string; code: string; name: string; baseUnit: string }[];
  locations: { id: string; code: string; name: string }[];
  pendingReturnRequests: { id: string; requestNumber: string; reason: string; retailerId: string | null }[];
  openVendorBills: { id: string; billNumber: string; vendorId: string; due: number }[];
};
type HomeData = {
  recentTransactions: { id: string; transactionNumber: string; purposeCode: string; direction: Direction; status: string; amount: string | number; date: string; requestedById: string; counterpartyName: string | null; failureReason: string | null }[];
  pendingApprovals: { id: string; transactionNumber: string; purposeCode: string; amount: string | number; requestedById: string }[];
  needsAttention: { id: string; transactionNumber: string; purposeCode: string; amount: string | number; failureReason: string | null }[];
  cashBankToday: { treasuryAccountId: string; name: string; kind: string; balance: number; movedToday: number }[];
  canApprove: boolean;
  canVoid: boolean;
  salesDistribution: {
    pendingPaymentProofs: { id: string; orderNumber: string; partyName: string; amount: string | number; reference: string; submittedAt: string; actionPath: string }[];
    pendingTaClaims: { id: string; claimNumber: string; employeeName: string; amount: string | number | null; sentToAccountsAt: string | null; actionPath: string }[];
    recentEntries: { id: string; entryNumber: string; type: string; amount: string | number; postedAt: string | null; reason: string }[];
  };
};

const FIELD_LABEL: Record<string, { en: string; hi: string; type: "text" | "number" | "date" | "select-material" | "select-location" | "select-vendor" | "select-bill" | "select-return" | "select-unit" | "checkbox" }> = {
  counterpartyId: { en: "Vendor", hi: "विक्रेता", type: "select-vendor" },
  counterpartyName: { en: "Name / description", hi: "नाम / विवरण", type: "text" },
  vendorInvoiceNumber: { en: "Vendor invoice #", hi: "विक्रेता चालान #", type: "text" },
  invoiceDate: { en: "Invoice date", hi: "चालान तिथि", type: "date" },
  dueDate: { en: "Due date", hi: "देय तिथि", type: "date" },
  materialId: { en: "Material", hi: "सामग्री", type: "select-material" },
  quantity: { en: "Quantity", hi: "मात्रा", type: "number" },
  unit: { en: "Unit", hi: "इकाई", type: "select-unit" },
  locationId: { en: "Location", hi: "स्थान", type: "select-location" },
  unitCost: { en: "Unit cost (optional)", hi: "इकाई लागत (वैकल्पिक)", type: "number" },
  manufactureDate: { en: "Manufacture date", hi: "निर्माण तिथि", type: "date" },
  expiryDate: { en: "Expiry date", hi: "समाप्ति तिथि", type: "date" },
  paidNow: { en: "Paid now (vs. on credit)", hi: "अभी भुगतान (बनाम उधार)", type: "checkbox" },
  billId: { en: "Vendor bill", hi: "विक्रेता बिल", type: "select-bill" },
  retailerId: { en: "Retailer (optional)", hi: "रिटेलर (वैकल्पिक)", type: "text" },
  sourceReturnRequestId: { en: "Return request", hi: "वापसी अनुरोध", type: "select-return" },
  adjustmentAccountCode: { en: "Account code", hi: "खाता कोड", type: "text" },
  employeeId: { en: "Employee", hi: "कर्मचारी", type: "text" },
  usefulLifeMonths: { en: "Useful life (months)", hi: "उपयोगी जीवन (महीने)", type: "number" },
  residualValue: { en: "Residual value", hi: "अवशिष्ट मूल्य", type: "number" },
  category: { en: "Category", hi: "श्रेणी", type: "text" },
  taxable: { en: "Taxable amount", hi: "कर योग्य राशि", type: "number" },
  cgst: { en: "CGST", hi: "सीजीएसटी", type: "number" },
  sgst: { en: "SGST", hi: "एसजीएसटी", type: "number" },
  igst: { en: "IGST", hi: "आईजीएसटी", type: "number" },
  skuLines: { en: "Items (SKU:qty:rate, comma-separated)", hi: "आइटम (SKU:मात्रा:दर, अल्पविराम से अलग)", type: "text" },
  gstin: { en: "GSTIN", hi: "जीएसटीएन", type: "text" },
};

export function MoneyDeskPanel({ language, purposes, supporting, home }: { language: "EN" | "HI"; purposes: PurposeDef[]; supporting: SupportingData; home: HomeData }) {
  const hi = language === "HI";
  const router = useRouter();
  const [openDirection, setOpenDirection] = useState<"IN" | "OUT" | null>(null);
  const [purposeCode, setPurposeCode] = useState<string>("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [decisionBusyId, setDecisionBusyId] = useState<string | null>(null);

  const purposesForDirection = useMemo(() => {
    if (!openDirection) return [];
    const wanted: Direction[] = openDirection === "IN" ? ["CASH_IN", "BANK_IN"] : ["CASH_OUT", "BANK_OUT", "ADJUSTMENT"];
    return purposes.filter((p) => p.allowedDirections.some((d) => wanted.includes(d)));
  }, [openDirection, purposes]);
  const selectedPurpose = purposes.find((p) => p.code === purposeCode);

  function closeForm() {
    setOpenDirection(null);
    setPurposeCode("");
    setMessage(null);
  }

  function submitForm(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!selectedPurpose) return;
    const f = new FormData(e.currentTarget);
    const direction = String(f.get("direction")) as Direction;
    const amount = Number(f.get("amount"));
    const formData: Record<string, unknown> = {};
    for (const field of [...selectedPurpose.requiredFields, ...selectedPurpose.optionalFields]) {
      const raw = f.get(field);
      if (raw == null || raw === "") continue;
      const meta = FIELD_LABEL[field];
      if (field === "skuLines") {
        formData.skuLines = String(raw)
          .split(",")
          .map((part) => part.trim())
          .filter(Boolean)
          .map((part) => {
            const [skuId, quantity, rate] = part.split(":");
            return { skuId, quantity: Number(quantity ?? 1), rate: rate ? Number(rate) : undefined };
          });
      } else if (meta?.type === "checkbox") {
        formData[field] = f.get(field) === "on";
      } else if (meta?.type === "number") {
        formData[field] = Number(raw);
      } else {
        formData[field] = String(raw);
      }
    }
    formData.paymentMode = direction === "CASH_IN" || direction === "CASH_OUT" ? "CASH" : "BANK";
    setBusy(true);
    setMessage(null);
    void post("money-desk-create", {
      purposeCode: selectedPurpose.code,
      direction,
      amount,
      date: new Date().toISOString(),
      treasuryAccountId: String(f.get("treasuryAccountId") || "") || undefined,
      counterpartyType: selectedPurpose.requiredFields.includes("counterpartyId") ? "VENDOR" : undefined,
      counterpartyId: (formData.counterpartyId as string) || undefined,
      counterpartyName: (formData.counterpartyName as string) || undefined,
      description: (formData.counterpartyName as string) || selectedPurpose.label,
      documentFileId: (String(f.get("documentFileId") || "")) || undefined,
      formData: {
        ...formData,
        treasuryAccountCoaCode: supporting.treasuryAccounts.find((t) => t.id === String(f.get("treasuryAccountId")))?.coaCode,
      },
      idempotencyKey: key(),
    })
      .then((result) => {
        setMessage({ ok: true, text: hi ? `सहेजा गया — स्थिति: ${result.status}` : `Saved — status: ${result.status}` });
        router.refresh();
      })
      .catch((err) => setMessage({ ok: false, text: err instanceof Error ? err.message : "Could not save" }))
      .finally(() => setBusy(false));
  }

  function decide(transactionId: string, decision: "APPROVED" | "REJECTED") {
    const reason = window.prompt(hi ? "कारण" : "Reason") ?? "";
    if (!reason.trim()) return;
    setDecisionBusyId(transactionId);
    void post("money-desk-decide-approval", { transactionId, decision, reason })
      .then(() => router.refresh())
      .catch((err) => setMessage({ ok: false, text: err instanceof Error ? err.message : "Could not decide" }))
      .finally(() => setDecisionBusyId(null));
  }

  return (
    <section className={styles.panel}>
      <div>
        <small>{hi ? "मनी डेस्क" : "MONEY DESK"}</small>
        <h2>{hi ? "पैसा प्रबंधन" : "Money Management"}</h2>
      </div>

      <div className={styles.tableWrap} style={{ gridColumn: "1/-1" }}>
        <strong>{hi ? "आज नकद / बैंक (वास्तविक बहीखाता)" : "Today's Cash / Bank (real ledger)"}</strong>
        <table>
          <thead><tr><th>{hi ? "खाता" : "Account"}</th><th>{hi ? "शेष" : "Balance"}</th><th>{hi ? "आज की गतिविधि" : "Moved today"}</th></tr></thead>
          <tbody>
            {home.cashBankToday.map((a) => (
              <tr key={a.treasuryAccountId}><td>{a.name} ({a.kind})</td><td>{money(a.balance)}</td><td>{money(a.movedToday)}</td></tr>
            ))}
          </tbody>
        </table>
      </div>

      <div style={{ gridColumn: "1/-1", display: "flex", gap: "0.75rem" }}>
        <button type="button" className={styles.primaryBig} onClick={() => setOpenDirection("IN")}>{hi ? "+ पैसा प्राप्त" : "+ RECORD MONEY IN"}</button>
        <button type="button" className={styles.primaryBig} onClick={() => setOpenDirection("OUT")}>{hi ? "+ पैसा भुगतान" : "+ RECORD MONEY OUT"}</button>
      </div>

      {openDirection && (
        <div style={{ gridColumn: "1/-1" }}>
          {!selectedPurpose ? (
            <div className={styles.list}>
              <strong>{hi ? "उद्देश्य चुनें" : "Choose what this is for"}</strong>
              <ul className={styles.list}>
                {purposesForDirection.map((p) => (
                  <li key={p.code}>
                    <button type="button" className={styles.secondaryBig} onClick={() => setPurposeCode(p.code)}>
                      {hi ? p.hindiLabel : p.label}
                    </button>
                    <p><small>{p.description}</small></p>
                  </li>
                ))}
              </ul>
              <button type="button" className={styles.secondaryBig} onClick={closeForm}>{hi ? "रद्द करें" : "Cancel"}</button>
            </div>
          ) : (
            <form onSubmit={submitForm}>
              <p><strong>{hi ? selectedPurpose.hindiLabel : selectedPurpose.label}</strong> — {selectedPurpose.description}</p>
              <label>
                {hi ? "दिशा" : "Direction"}
                <select name="direction" required defaultValue={selectedPurpose.allowedDirections[0]}>
                  {selectedPurpose.allowedDirections.map((d) => <option key={d} value={d}>{d}</option>)}
                </select>
              </label>
              <label>{hi ? "राशि" : "Amount"}<input name="amount" type="number" step="0.01" min="0.01" required /></label>
              <label>
                {hi ? "खाता" : "Treasury account"}
                <select name="treasuryAccountId">
                  <option value="">{hi ? "चुनें" : "Choose"}</option>
                  {supporting.treasuryAccounts.map((t) => <option key={t.id} value={t.id}>{t.name} ({t.kind})</option>)}
                </select>
              </label>
              {[...selectedPurpose.requiredFields, ...selectedPurpose.optionalFields].map((field) => {
                const meta = FIELD_LABEL[field];
                if (!meta) return null;
                const required = selectedPurpose.requiredFields.includes(field);
                const labelText = `${hi ? meta.hi : meta.en}${required ? " *" : ""}`;
                if (meta.type === "select-vendor") return (
                  <label key={field}>{labelText}<select name={field} required={required}><option value="">{hi ? "चुनें" : "Choose"}</option>{supporting.vendors.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}</select></label>
                );
                if (meta.type === "select-material") return (
                  <label key={field}>{labelText}<select name={field} required={required}><option value="">{hi ? "चुनें" : "Choose"}</option>{supporting.materials.map((m) => <option key={m.id} value={m.id}>{m.name} ({m.code})</option>)}</select></label>
                );
                if (meta.type === "select-location") return (
                  <label key={field}>{labelText}<select name={field} required={required}><option value="">{hi ? "चुनें" : "Choose"}</option>{supporting.locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}</select></label>
                );
                if (meta.type === "select-bill") return (
                  <label key={field}>{labelText}<select name={field} required={required}><option value="">{hi ? "चुनें" : "Choose"}</option>{supporting.openVendorBills.map((b) => <option key={b.id} value={b.id}>{b.billNumber} — {money(b.due)} due</option>)}</select></label>
                );
                if (meta.type === "select-return") return (
                  <label key={field}>{labelText}<select name={field} required={required}><option value="">{hi ? "चुनें" : "Choose"}</option>{supporting.pendingReturnRequests.map((r) => <option key={r.id} value={r.id}>{r.requestNumber} — {r.reason}</option>)}</select></label>
                );
                if (meta.type === "select-unit") return (
                  <label key={field}>{labelText}<select name={field} required={required}><option value="">{hi ? "चुनें" : "Choose"}</option>{["KG", "GRAM", "LITRE", "ML", "PCS", "ROLL", "BOX", "BAG", "CARTON", "DRUM", "CAN", "METER", "OTHER"].map((u) => <option key={u} value={u}>{u}</option>)}</select></label>
                );
                if (meta.type === "checkbox") return (
                  <label key={field}><input name={field} type="checkbox" /> {labelText}</label>
                );
                return (
                  <label key={field}>{labelText}<input name={field} type={meta.type === "date" ? "date" : meta.type === "number" ? "number" : "text"} step={meta.type === "number" ? "0.01" : undefined} required={required} /></label>
                );
              })}
              {selectedPurpose.documentPolicy !== "NONE" && (
                <label>{hi ? "दस्तावेज़ आईडी" : "Document file id"} {selectedPurpose.documentPolicy === "REQUIRED" ? "*" : ""}<input name="documentFileId" required={selectedPurpose.documentPolicy === "REQUIRED"} /></label>
              )}
              <button disabled={busy} className={styles.primaryBig}>{hi ? "सहेजें" : "SAVE"}</button>
              <button type="button" className={styles.secondaryBig} disabled={busy} onClick={closeForm}>{hi ? "रद्द करें" : "Cancel"}</button>
            </form>
          )}
        </div>
      )}

      {message && <p role="status" data-ok={message.ok} className={message.ok ? undefined : styles.cardError} style={{ gridColumn: "1/-1" }}>{message.text}</p>}

      {home.canApprove && home.pendingApprovals.length > 0 && (
        <div className={styles.tableWrap} style={{ gridColumn: "1/-1" }}>
          <strong>{hi ? "अनुमोदन प्रतीक्षित" : "Pending approvals"}</strong>
          <table>
            <thead><tr><th>#</th><th>{hi ? "उद्देश्य" : "Purpose"}</th><th>{hi ? "राशि" : "Amount"}</th><th></th></tr></thead>
            <tbody>
              {home.pendingApprovals.map((t) => (
                <tr key={t.id}>
                  <td>{t.transactionNumber}</td><td>{t.purposeCode}</td><td>{money(t.amount)}</td>
                  <td>
                    <button type="button" disabled={decisionBusyId === t.id} onClick={() => decide(t.id, "APPROVED")}>{hi ? "स्वीकृत" : "Approve"}</button>{" "}
                    <button type="button" disabled={decisionBusyId === t.id} onClick={() => decide(t.id, "REJECTED")}>{hi ? "अस्वीकृत" : "Reject"}</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {home.needsAttention.length > 0 && (
        <div className={styles.tableWrap} style={{ gridColumn: "1/-1" }}>
          <strong>{hi ? "ध्यान देने योग्य" : "Needs attention"}</strong>
          <table>
            <thead><tr><th>#</th><th>{hi ? "उद्देश्य" : "Purpose"}</th><th>{hi ? "राशि" : "Amount"}</th><th>{hi ? "कारण" : "Reason"}</th></tr></thead>
            <tbody>
              {home.needsAttention.map((t) => <tr key={t.id}><td>{t.transactionNumber}</td><td>{t.purposeCode}</td><td>{money(t.amount)}</td><td>{t.failureReason}</td></tr>)}
            </tbody>
          </table>
        </div>
      )}

      {(home.salesDistribution.pendingPaymentProofs.length > 0 || home.salesDistribution.pendingTaClaims.length > 0) && (
        <div className={styles.tableWrap} style={{ gridColumn: "1/-1" }}>
          <strong>{hi ? "बिक्री एवं वितरण — लंबित कार्य" : "Sales & Distribution — pending actions"}</strong>
          <table>
            <thead><tr><th>{hi ? "प्रकार" : "Type"}</th><th>#</th><th>{hi ? "पार्टी / कर्मचारी" : "Party / Employee"}</th><th>{hi ? "राशि" : "Amount"}</th><th></th></tr></thead>
            <tbody>
              {home.salesDistribution.pendingPaymentProofs.map((p) => (
                <tr key={`proof-${p.id}`}>
                  <td>{hi ? "एस.एस. भुगतान प्रमाण" : "S.S. Payment Proof"}</td>
                  <td>{p.orderNumber}</td>
                  <td>{p.partyName}</td>
                  <td>{money(p.amount)}</td>
                  <td><a href={p.actionPath}>{hi ? "समीक्षा करें" : "Review"}</a></td>
                </tr>
              ))}
              {home.salesDistribution.pendingTaClaims.map((c) => (
                <tr key={`ta-${c.id}`}>
                  <td>{hi ? "टीए प्रतिपूर्ति" : "TA Reimbursement"}</td>
                  <td>{c.claimNumber}</td>
                  <td>{c.employeeName}</td>
                  <td>{money(c.amount)}</td>
                  <td><a href={c.actionPath}>{hi ? "भुगतान करें" : "Pay"}</a></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {home.salesDistribution.recentEntries.length > 0 && (
        <div className={styles.tableWrap} style={{ gridColumn: "1/-1" }}>
          <strong>{hi ? "हाल की बिक्री एवं वितरण गतिविधि" : "Recent Sales & Distribution activity"}</strong>
          <table>
            <thead><tr><th>#</th><th>{hi ? "प्रकार" : "Type"}</th><th>{hi ? "राशि" : "Amount"}</th><th>{hi ? "विवरण" : "Reason"}</th></tr></thead>
            <tbody>
              {home.salesDistribution.recentEntries.map((e) => (
                <tr key={e.id}><td>{e.entryNumber}</td><td>{e.type}</td><td>{money(e.amount)}</td><td>{e.reason}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className={styles.tableWrap} style={{ gridColumn: "1/-1" }}>
        <strong>{hi ? "हाल के लेनदेन" : "Recent transactions"}</strong>
        <table>
          <thead><tr><th>#</th><th>{hi ? "उद्देश्य" : "Purpose"}</th><th>{hi ? "दिशा" : "Direction"}</th><th>{hi ? "राशि" : "Amount"}</th><th>{hi ? "स्थिति" : "Status"}</th></tr></thead>
          <tbody>
            {home.recentTransactions.length === 0 && <tr><td colSpan={5}>{hi ? "कोई लेनदेन नहीं।" : "No transactions yet."}</td></tr>}
            {home.recentTransactions.map((t) => (
              <tr key={t.id}><td>{t.transactionNumber}</td><td>{t.purposeCode}</td><td>{t.direction}</td><td>{money(t.amount)}</td><td>{t.status}</td></tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
