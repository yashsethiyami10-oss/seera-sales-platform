"use client";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import styles from "./WorkflowActions.module.css";
import { GuidedMoneyIn } from "./GuidedMoneyIn";
import { SmartFinanceEntry } from "./SmartFinanceEntry";

const key = () => crypto.randomUUID();
async function post(action: string, payload: unknown) {
  const r = await fetch("/api/finance/company-operations", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, payload }) });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d?.error?.message ?? d?.error?.code ?? "Action failed");
  return d;
}
const money = (v: number | string | null | undefined) => `₹${Math.round(Number(v ?? 0)).toLocaleString("en-IN")}`;

type Direction = "CASH_IN" | "CASH_OUT" | "BANK_IN" | "BANK_OUT" | "ADJUSTMENT";
type PurposeGroup = "RECEIPTS" | "PROCUREMENT" | "EMPLOYEE" | "LOGISTICS" | "PREMISES_ADMIN" | "MARKETING" | "FINANCE" | "OTHER";
type PurposeDef = {
  code: string;
  label: string;
  hindiLabel: string;
  group: PurposeGroup;
  allowedDirections: Direction[];
  requiredFields: string[];
  optionalFields: string[];
  documentPolicy: "REQUIRED" | "OPTIONAL" | "NONE";
  description: string;
};

// Founder-visual-review fix (§6): the Money Out picker used to be one long flat vertical list of
// technical purpose codes. Grouped into the same business categories the Founder actually asked
// for, rendered as labeled sections rather than a single <ul>.
const GROUP_LABEL: Record<PurposeGroup, { en: string; hi: string }> = {
  RECEIPTS: { en: "Receipts", hi: "प्राप्तियां" },
  PROCUREMENT: { en: "Procurement", hi: "खरीद" },
  EMPLOYEE: { en: "Employee", hi: "कर्मचारी" },
  LOGISTICS: { en: "Logistics", hi: "लॉजिस्टिक्स" },
  PREMISES_ADMIN: { en: "Premises / Admin", hi: "परिसर / प्रशासन" },
  MARKETING: { en: "Marketing", hi: "मार्केटिंग" },
  FINANCE: { en: "Finance", hi: "वित्त" },
  OTHER: { en: "Other", hi: "अन्य" },
};
const GROUP_ORDER: PurposeGroup[] = ["PROCUREMENT", "EMPLOYEE", "LOGISTICS", "PREMISES_ADMIN", "MARKETING", "FINANCE", "OTHER", "RECEIPTS"];
type SupportingData = {
  treasuryAccounts: { id: string; name: string; kind: string; coaCode: string }[];
  vendors: { id: string; name: string }[];
  materials: { id: string; code: string; name: string; baseUnit: string }[];
  locations: { id: string; code: string; name: string }[];
  pendingReturnRequests: { id: string; requestNumber: string; reason: string; retailerId: string | null }[];
  openVendorBills: { id: string; billNumber: string; vendorId: string; due: number }[];
  territories: { id: string; name: string }[];
};
type TxnRow = { id: string; transactionNumber: string; purposeCode: string; direction: Direction; status: string; amount: string | number; date: string; requestedById: string; counterpartyName: string | null; failureReason: string | null; employeeName?: string | null; territoryName?: string | null; treasuryName?: string | null; source?: string | null };
type HomeData = {
  recentTransactions: TxnRow[];
  pendingApprovals: { id: string; transactionNumber: string; purposeCode: string; amount: string | number; requestedById: string; isSelf?: boolean }[];
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

// Rough, purpose-driven ledger-impact preview for the Review step — text only, computed from the
// SAME registry data already loaded, never a second accounting calculation.
function ledgerImpactPreview(purpose: PurposeDef, hi: boolean): string {
  if (purpose.code === "PUR-RM") return hi ? "गोदाम स्टॉक + विक्रेता बिल/भुगतान बनेगा" : "Creates warehouse stock + a Vendor Bill/Payment";
  if (purpose.code === "PAY-VEN") return hi ? "विक्रेता लेजर में डेबिट — बकाया कम होगा" : "Debit to Vendor Ledger — reduces payable";
  if (purpose.code === "AST-MCH") return hi ? "स्थायी संपत्ति के रूप में पूंजीकृत" : "Capitalized as a Fixed Asset";
  return hi ? "व्यय के रूप में पोस्ट — सामान्य खाता बही" : "Posted as an Expense — general ledger";
}

function OutFieldControl({ field, value, onChange, supporting, hi, required }: { field: string; value: string; onChange: (v: string) => void; supporting: SupportingData; hi: boolean; required: boolean }) {
  const meta = FIELD_LABEL[field];
  if (!meta) return null;
  if (meta.type === "select-vendor") return <select value={value} onChange={(e) => onChange(e.target.value)} required={required}><option value="">{hi ? "चुनें" : "Choose"}</option>{supporting.vendors.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}</select>;
  if (meta.type === "select-material") return <select value={value} onChange={(e) => onChange(e.target.value)} required={required}><option value="">{hi ? "चुनें" : "Choose"}</option>{supporting.materials.map((m) => <option key={m.id} value={m.id}>{m.name} ({m.code})</option>)}</select>;
  if (meta.type === "select-location") return <select value={value} onChange={(e) => onChange(e.target.value)} required={required}><option value="">{hi ? "चुनें" : "Choose"}</option>{supporting.locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}</select>;
  if (meta.type === "select-bill") return <select value={value} onChange={(e) => onChange(e.target.value)} required={required}><option value="">{hi ? "चुनें" : "Choose"}</option>{supporting.openVendorBills.map((b) => <option key={b.id} value={b.id}>{b.billNumber} — {money(b.due)} due</option>)}</select>;
  if (meta.type === "select-return") return <select value={value} onChange={(e) => onChange(e.target.value)} required={required}><option value="">{hi ? "चुनें" : "Choose"}</option>{supporting.pendingReturnRequests.map((r) => <option key={r.id} value={r.id}>{r.requestNumber} — {r.reason}</option>)}</select>;
  if (meta.type === "select-unit") return <select value={value} onChange={(e) => onChange(e.target.value)} required={required}><option value="">{hi ? "चुनें" : "Choose"}</option>{["KG", "GRAM", "LITRE", "ML", "PCS", "ROLL", "BOX", "BAG", "CARTON", "DRUM", "CAN", "METER", "OTHER"].map((u) => <option key={u} value={u}>{u}</option>)}</select>;
  if (meta.type === "checkbox") return <input type="checkbox" checked={value === "on"} onChange={(e) => onChange(e.target.checked ? "on" : "")} />;
  return <input value={value} onChange={(e) => onChange(e.target.value)} type={meta.type === "date" ? "date" : meta.type === "number" ? "number" : "text"} step={meta.type === "number" ? "0.01" : undefined} required={required} />;
}

export function MoneyDeskPanel({ language, portal, purposes, supporting, home }: { language: "EN" | "HI"; portal: string; purposes: PurposeDef[]; supporting: SupportingData; home: HomeData }) {
  const hi = language === "HI";
  const router = useRouter();
  const [openDirection, setOpenDirection] = useState<"IN" | "OUT" | null>(null);
  const [purposeCode, setPurposeCode] = useState<string>("");
  const [outStep, setOutStep] = useState(0); // 0=business context, 1=treasury/payment, 2=territory/cost centre, 3=review
  const [direction, setDirection] = useState<Direction | "">("");
  const [amount, setAmount] = useState("");
  const [treasuryAccountId, setTreasuryAccountId] = useState("");
  const [documentFileId, setDocumentFileId] = useState("");
  const [employeeId, setEmployeeId] = useState("");
  const [territoryId, setTerritoryId] = useState("");
  const [fieldValues, setFieldValues] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [decisionBusyId, setDecisionBusyId] = useState<string | null>(null);

  const purposesForDirection = useMemo(() => {
    if (openDirection !== "OUT") return [];
    return purposes.filter((p) => p.allowedDirections.some((d) => (["CASH_OUT", "BANK_OUT", "ADJUSTMENT"] as Direction[]).includes(d)));
  }, [openDirection, purposes]);
  const purposeGroupsForDirection = useMemo(() => {
    const groups = new Map<PurposeGroup, PurposeDef[]>();
    for (const p of purposesForDirection) {
      if (!groups.has(p.group)) groups.set(p.group, []);
      groups.get(p.group)!.push(p);
    }
    return GROUP_ORDER.filter((g) => groups.has(g)).map((g) => ({ group: g, items: groups.get(g)! }));
  }, [purposesForDirection]);
  const selectedPurpose = purposes.find((p) => p.code === purposeCode);
  const purposeLabel = useMemo(() => {
    const byCode = new Map(purposes.map((p) => [p.code, hi ? p.hindiLabel : p.label]));
    return (code: string) => byCode.get(code) ?? code;
  }, [purposes, hi]);
  const businessFields = useMemo(() => (selectedPurpose ? [...selectedPurpose.requiredFields, ...selectedPurpose.optionalFields].filter((f) => f !== "employeeId" && f !== "territoryId") : []), [selectedPurpose]);

  function closeForm() {
    setOpenDirection(null);
    setPurposeCode("");
    setOutStep(0);
    setDirection("");
    setAmount("");
    setTreasuryAccountId("");
    setDocumentFileId("");
    setEmployeeId("");
    setTerritoryId("");
    setFieldValues({});
    setMessage(null);
  }

  function pickPurpose(p: PurposeDef) {
    setPurposeCode(p.code);
    setDirection(p.allowedDirections[0] ?? "");
    setOutStep(0);
  }

  function submitOut() {
    if (!selectedPurpose || !direction) return;
    const formData: Record<string, unknown> = {};
    for (const field of businessFields) {
      const raw = fieldValues[field];
      if (raw == null || raw === "") continue;
      const meta = FIELD_LABEL[field];
      if (field === "skuLines") {
        formData.skuLines = raw.split(",").map((part) => part.trim()).filter(Boolean).map((part) => { const [skuId, quantity, rate] = part.split(":"); return { skuId, quantity: Number(quantity ?? 1), rate: rate ? Number(rate) : undefined }; });
      } else if (meta?.type === "checkbox") {
        formData[field] = raw === "on";
      } else if (meta?.type === "number") {
        formData[field] = Number(raw);
      } else {
        formData[field] = raw;
      }
    }
    formData.paymentMode = direction === "CASH_IN" || direction === "CASH_OUT" ? "CASH" : "BANK";
    if (employeeId) formData.employeeId = employeeId;
    if (territoryId) formData.territoryId = territoryId;
    setBusy(true);
    setMessage(null);
    void post("money-desk-create", {
      purposeCode: selectedPurpose.code,
      direction,
      amount: Number(amount),
      date: new Date().toISOString(),
      treasuryAccountId: treasuryAccountId || undefined,
      counterpartyType: selectedPurpose.requiredFields.includes("counterpartyId") ? "VENDOR" : undefined,
      counterpartyId: (formData.counterpartyId as string) || undefined,
      counterpartyName: (formData.counterpartyName as string) || undefined,
      description: (formData.counterpartyName as string) || selectedPurpose.label,
      documentFileId: documentFileId || undefined,
      formData: { ...formData, treasuryAccountCoaCode: supporting.treasuryAccounts.find((t) => t.id === treasuryAccountId)?.coaCode },
      idempotencyKey: key(),
    })
      .then((result) => {
        setMessage({ ok: true, text: hi ? `सहेजा गया — स्थिति: ${result.status}` : `Saved — status: ${result.status}` });
        closeForm();
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

  const OUT_STEP_LABEL = hi ? ["व्यवसाय विवरण", "ट्रेजरी / भुगतान", "क्षेत्र / कॉस्ट सेंटर", "समीक्षा"] : ["Business Context", "Treasury / Payment", "Territory / Cost Centre", "Review"];

  return (
    <section className={styles.panel}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", flexWrap: "wrap", gap: "0.5rem" }}>
        <div>
          <small>{hi ? "मनी डेस्क" : "MONEY DESK"}</small>
          <h2>{hi ? "पैसा प्रबंधन" : "Money Management"}</h2>
        </div>
        <a href={`/portal/${portal}/finance-os`} style={{ fontSize: "0.85rem" }}>{hi ? "फाइनेंस ओएस खोलें (लेजर, रिपोर्ट, विवरण) →" : "Open Finance OS (Ledgers, Reports, Statements) →"}</a>
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

      {!openDirection && (
        <>
          <SmartFinanceEntry language={language} territories={supporting.territories} purposes={purposes.map((p) => ({ code: p.code, label: p.label, hindiLabel: p.hindiLabel }))} />
          <div style={{ gridColumn: "1/-1", display: "flex", gap: "0.75rem", flexWrap: "wrap", alignItems: "center" }}>
            <small style={{ opacity: 0.6 }}>{hi ? "या निर्देशित प्रविष्टि:" : "or use guided entry:"}</small>
            <button type="button" className={styles.primaryBig} onClick={() => setOpenDirection("IN")}>{hi ? "+ पैसा प्राप्त" : "+ RECORD MONEY IN"}</button>
            <button type="button" className={styles.primaryBig} onClick={() => setOpenDirection("OUT")}>{hi ? "+ पैसा भुगतान" : "+ RECORD MONEY OUT"}</button>
          </div>
        </>
      )}

      {openDirection === "IN" && (
        <div style={{ gridColumn: "1/-1" }}>
          <GuidedMoneyIn language={language} treasuryAccounts={supporting.treasuryAccounts} onDone={closeForm} onCancel={closeForm} />
        </div>
      )}

      {openDirection === "OUT" && (
        <div style={{ gridColumn: "1/-1" }}>
          {!selectedPurpose ? (
            <div className={styles.list}>
              <strong>{hi ? "उद्देश्य चुनें" : "Choose what this is for"}</strong>
              {purposeGroupsForDirection.map(({ group, items }) => (
                <div key={group} style={{ marginTop: "0.75rem" }}>
                  {purposeGroupsForDirection.length > 1 && <small style={{ display: "block", opacity: 0.7, textTransform: "uppercase", letterSpacing: "0.04em" }}>{hi ? GROUP_LABEL[group].hi : GROUP_LABEL[group].en}</small>}
                  <ul className={styles.list} style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: "0.5rem" }}>
                    {items.map((p) => (
                      <li key={p.code} style={{ listStyle: "none" }}>
                        <button type="button" className={styles.secondaryBig} title={p.description} onClick={() => pickPurpose(p)} style={{ width: "100%" }}>
                          {hi ? p.hindiLabel : p.label}
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
              <button type="button" className={styles.secondaryBig} onClick={closeForm} style={{ marginTop: "0.75rem" }}>{hi ? "रद्द करें" : "Cancel"}</button>
            </div>
          ) : (
            <div className={styles.list}>
              <p><strong>{hi ? selectedPurpose.hindiLabel : selectedPurpose.label}</strong> — {selectedPurpose.description}</p>
              <small>{hi ? `चरण ${outStep + 1} / 4 — ${OUT_STEP_LABEL[outStep]}` : `STEP ${outStep + 1} of 4 — ${OUT_STEP_LABEL[outStep]}`}</small>

              {outStep === 0 && (
                <div className={styles.list}>
                  {selectedPurpose.allowedDirections.length > 1 && (
                    <label>{hi ? "दिशा" : "Direction"}
                      <select value={direction} onChange={(e) => setDirection(e.target.value as Direction)}>
                        {selectedPurpose.allowedDirections.map((d) => <option key={d} value={d}>{d}</option>)}
                      </select>
                    </label>
                  )}
                  <label>{hi ? "राशि" : "Amount"}<input type="number" step="0.01" min="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} /></label>
                  {businessFields.map((field) => {
                    const meta = FIELD_LABEL[field];
                    if (!meta) return null;
                    const required = selectedPurpose.requiredFields.includes(field);
                    return (
                      <label key={field}>{`${hi ? meta.hi : meta.en}${required ? " *" : ""}`}
                        <OutFieldControl field={field} value={fieldValues[field] ?? ""} onChange={(v) => setFieldValues((s) => ({ ...s, [field]: v }))} supporting={supporting} hi={hi} required={required} />
                      </label>
                    );
                  })}
                  <div style={{ display: "flex", gap: "0.5rem" }}>
                    <button type="button" className={styles.secondaryBig} onClick={closeForm}>{hi ? "रद्द करें" : "Cancel"}</button>
                    <button type="button" className={styles.primaryBig} disabled={!amount || Number(amount) <= 0} onClick={() => setOutStep(1)}>{hi ? "आगे" : "Next"}</button>
                  </div>
                </div>
              )}

              {outStep === 1 && (
                <div className={styles.list}>
                  <label>{hi ? "खाता" : "Treasury account"}
                    {supporting.treasuryAccounts.length === 0 ? (
                      <span className={styles.emptyHint}>{hi ? "कोई ट्रेजरी खाता कॉन्फ़िगर नहीं है।" : "No Treasury Accounts configured."}</span>
                    ) : (
                      <select value={treasuryAccountId} onChange={(e) => setTreasuryAccountId(e.target.value)}>
                        <option value="">{hi ? "चुनें" : "Choose"}</option>
                        {supporting.treasuryAccounts.map((t) => <option key={t.id} value={t.id}>{t.name} ({t.kind})</option>)}
                      </select>
                    )}
                  </label>
                  {selectedPurpose.documentPolicy !== "NONE" && (
                    <label>{hi ? "दस्तावेज़ आईडी" : "Document file id"} {selectedPurpose.documentPolicy === "REQUIRED" ? "*" : ""}<input value={documentFileId} onChange={(e) => setDocumentFileId(e.target.value)} /></label>
                  )}
                  <div style={{ display: "flex", gap: "0.5rem" }}>
                    <button type="button" className={styles.secondaryBig} onClick={() => setOutStep(0)}>{hi ? "पीछे" : "Back"}</button>
                    <button type="button" className={styles.primaryBig} disabled={selectedPurpose.documentPolicy === "REQUIRED" && !documentFileId} onClick={() => setOutStep(2)}>{hi ? "आगे" : "Next"}</button>
                  </div>
                </div>
              )}

              {outStep === 2 && (
                <div className={styles.list}>
                  <label>{hi ? "कर्मचारी (वैकल्पिक)" : "Employee (optional)"}
                    <input value={employeeId} onChange={(e) => setEmployeeId(e.target.value)} required={selectedPurpose.requiredFields.includes("employeeId")} placeholder={hi ? "कर्मचारी आईडी" : "Employee id"} />
                  </label>
                  <label>{hi ? "क्षेत्र / टेरिटरी (वैकल्पिक)" : "Territory (optional)"}
                    <select value={territoryId} onChange={(e) => setTerritoryId(e.target.value)}>
                      <option value="">{hi ? "स्वतः-व्युत्पन्न / कॉस्ट सेंटर" : "Auto-derive / Cost Centre"}</option>
                      {supporting.territories.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                    </select>
                  </label>
                  <p><small>{hi ? "टेरिटरी न चुनने पर कर्मचारी की टेरिटरी से स्वतः लिया जाएगा, अन्यथा एक कॉस्ट सेंटर (कॉर्पोरेट/हेड ऑफिस/गोदाम/मैन्युफैक्चरिंग) श्रेणी से स्वतः तय होगा — दोनों नहीं मांगे जाते।" : "Leaving Territory blank auto-derives it from the Employee when known; otherwise a Cost Centre (Corporate/Head Office/Warehouse/Manufacturing) is auto-derived from the category — never both, never asked twice."}</small></p>
                  <div style={{ display: "flex", gap: "0.5rem" }}>
                    <button type="button" className={styles.secondaryBig} onClick={() => setOutStep(1)}>{hi ? "पीछे" : "Back"}</button>
                    <button type="button" className={styles.primaryBig} onClick={() => setOutStep(3)}>{hi ? "समीक्षा करें" : "Review"}</button>
                  </div>
                </div>
              )}

              {outStep === 3 && (
                <div className={styles.list}>
                  <table>
                    <tbody>
                      <tr><td>{hi ? "उद्देश्य" : "Purpose"}</td><td>{hi ? selectedPurpose.hindiLabel : selectedPurpose.label}</td></tr>
                      <tr><td>{hi ? "राशि" : "Amount"}</td><td>{money(amount)}</td></tr>
                      <tr><td>{hi ? "ट्रेजरी" : "Treasury"}</td><td>{supporting.treasuryAccounts.find((t) => t.id === treasuryAccountId)?.name ?? "—"}</td></tr>
                      {employeeId && <tr><td>{hi ? "कर्मचारी" : "Employee"}</td><td>{employeeId}</td></tr>}
                      <tr><td>{hi ? "क्षेत्र" : "Territory"}</td><td>{supporting.territories.find((t) => t.id === territoryId)?.name ?? (hi ? "स्वतः / कॉस्ट सेंटर" : "Auto-derived / Cost Centre")}</td></tr>
                      <tr><td>{hi ? "लेजर प्रभाव" : "Ledger Impact"}</td><td>{ledgerImpactPreview(selectedPurpose, hi)}</td></tr>
                    </tbody>
                  </table>
                  {message && !message.ok && <p role="status" data-ok="false">{message.text}</p>}
                  <div style={{ display: "flex", gap: "0.5rem" }}>
                    <button type="button" className={styles.secondaryBig} disabled={busy} onClick={() => setOutStep(2)}>{hi ? "पीछे" : "Back"}</button>
                    <button type="button" className={styles.primaryBig} disabled={busy} onClick={submitOut}>{busy ? (hi ? "पोस्ट हो रहा है…" : "Posting…") : (hi ? "पोस्ट करें" : "POST")}</button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {message && message.ok && <p role="status" data-ok={message.ok} style={{ gridColumn: "1/-1" }}>{message.text}</p>}

      {home.canApprove && home.pendingApprovals.length > 0 && (
        <div className={styles.tableWrap} style={{ gridColumn: "1/-1" }}>
          <strong>{hi ? "अनुमोदन प्रतीक्षित" : "Pending approvals"}</strong>
          <table>
            <thead><tr><th>#</th><th>{hi ? "उद्देश्य" : "Purpose"}</th><th>{hi ? "राशि" : "Amount"}</th><th></th></tr></thead>
            <tbody>
              {home.pendingApprovals.map((t) => (
                <tr key={t.id}>
                  <td><a href={`/portal/${portal}/money-desk/${t.id}`}>{t.transactionNumber}</a></td><td>{purposeLabel(t.purposeCode)}</td><td>{money(t.amount)}</td>
                  <td>
                    {t.isSelf ? (
                      <span className={styles.emptyHint}>{hi ? "स्वतंत्र अनुमोदन आवश्यक — आपने यह लेनदेन बनाया" : "Requires Independent Approval — you created this transaction"}</span>
                    ) : (
                      <>
                        <button type="button" disabled={decisionBusyId === t.id} onClick={() => decide(t.id, "APPROVED")}>{hi ? "स्वीकृत" : "Approve"}</button>{" "}
                        <button type="button" disabled={decisionBusyId === t.id} onClick={() => decide(t.id, "REJECTED")}>{hi ? "अस्वीकृत" : "Reject"}</button>
                      </>
                    )}
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
              {home.needsAttention.map((t) => <tr key={t.id}><td><a href={`/portal/${portal}/money-desk/${t.id}`}>{t.transactionNumber}</a></td><td>{purposeLabel(t.purposeCode)}</td><td>{money(t.amount)}</td><td>{t.failureReason}</td></tr>)}
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
          <thead><tr><th>#</th><th>{hi ? "उद्देश्य" : "Purpose"}</th><th>{hi ? "कर्मचारी" : "Employee"}</th><th>{hi ? "क्षेत्र" : "Territory"}</th><th>{hi ? "ट्रेजरी" : "Treasury"}</th><th>{hi ? "राशि" : "Amount"}</th><th>{hi ? "स्थिति" : "Status"}</th></tr></thead>
          <tbody>
            {home.recentTransactions.length === 0 && <tr><td colSpan={7}>{hi ? "कोई लेनदेन नहीं।" : "No transactions yet."}</td></tr>}
            {home.recentTransactions.map((t) => (
              <tr key={t.id}>
                <td><a href={`/portal/${portal}/money-desk/${t.id}`}>{t.transactionNumber}</a>{t.source === "SMART_FINANCE" && <span title={hi ? "स्मार्ट फाइनेंस से" : "via Smart Finance"} style={{ marginLeft: 6, fontSize: "0.7rem", fontWeight: 800, color: "#4338ca" }}>⚡</span>}</td>
                <td>{purposeLabel(t.purposeCode)}</td>
                <td>{t.employeeName ?? "—"}</td>
                <td>{t.territoryName ?? "—"}</td>
                <td>{t.treasuryName ?? "—"}</td>
                <td>{money(t.amount)}</td>
                <td>{t.status}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
