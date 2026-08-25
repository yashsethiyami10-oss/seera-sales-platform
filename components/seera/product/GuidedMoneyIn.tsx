"use client";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import styles from "./WorkflowActions.module.css";

const key = () => crypto.randomUUID();
const money = (v: number | string | null | undefined) => `₹${Math.round(Number(v ?? 0)).toLocaleString("en-IN")}`;
// Local-calendar-date, not UTC: `.toISOString()` would default this receipt's date to
// "yesterday" for any IST (UTC+5:30) user between midnight and 5:30am.
const isoDate = (v: Date) => `${v.getFullYear()}-${String(v.getMonth() + 1).padStart(2, "0")}-${String(v.getDate()).padStart(2, "0")}`;

async function post(action: string, payload: unknown) {
  const r = await fetch("/api/finance/company-operations", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, payload }) });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d?.error?.message ?? d?.error?.code ?? "Action failed");
  return d;
}
async function getReport(report: string, params: Record<string, string> = {}) {
  const qs = new URLSearchParams({ report, ...params }).toString();
  const r = await fetch(`/api/finance/company-reports?${qs}`);
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d?.error?.message ?? d?.error?.code ?? "Report failed");
  return d;
}

type ReceiptKind = "DISTRIBUTOR" | "SUPER_STOCKIST" | "COLLECTION" | "OTHER" | "MANUAL";
const KIND_LABEL: Record<ReceiptKind, { en: string; hi: string }> = {
  DISTRIBUTOR: { en: "Distributor Receipt", hi: "वितरक प्राप्ति" },
  SUPER_STOCKIST: { en: "S.S. Receipt", hi: "एस.एस. प्राप्ति" },
  COLLECTION: { en: "Customer Collection", hi: "ग्राहक संग्रह" },
  OTHER: { en: "Other Receipt", hi: "अन्य प्राप्ति" },
  MANUAL: { en: "Manual Money In", hi: "मैन्युअल पैसा प्राप्त" },
};
type OutstandingDoc = { documentId: string; documentNumber: string; amount: number; originalDueDate: string };
type TreasuryAccount = { id: string; name: string; kind: string; coaCode: string };

export function GuidedMoneyIn({ language, treasuryAccounts, onDone, onCancel }: { language: "EN" | "HI"; treasuryAccounts: TreasuryAccount[]; onDone: () => void; onCancel: () => void }) {
  const hi = language === "HI";
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [kind, setKind] = useState<ReceiptKind | null>(null);
  const [parties, setParties] = useState<{ id: string; name: string }[]>([]);
  const [partyId, setPartyId] = useState("");
  const [outstanding, setOutstanding] = useState<{ outstanding: OutstandingDoc[]; outstandingTotal: number; advancesAndUnapplied: number } | null>(null);
  const [documentId, setDocumentId] = useState<string>(""); // "" = unallocated/on-account
  const [counterpartyName, setCounterpartyName] = useState("");
  const [amount, setAmount] = useState("");
  const [treasuryAccountId, setTreasuryAccountId] = useState("");
  const [paymentMode, setPaymentMode] = useState("BANK");
  const [reference, setReference] = useState("");
  const [date, setDate] = useState(isoDate(new Date()));
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<string | null>(null);

  const isPartnerFlow = kind === "DISTRIBUTOR" || kind === "SUPER_STOCKIST";
  const partyName = parties.find((p) => p.id === partyId)?.name ?? "";
  const selectedDoc = outstanding?.outstanding.find((d) => d.documentId === documentId);

  useEffect(() => {
    if (!isPartnerFlow) return;
    getReport("ledger-parties", { partyType: kind === "DISTRIBUTOR" ? "DISTRIBUTOR" : "SUPER_STOCKIST" }).then(setParties).catch(() => setParties([]));
  }, [kind, isPartnerFlow]);

  function loadOutstanding(pid: string) {
    if (!isPartnerFlow || !pid) return;
    getReport("party-outstanding", { partyType: kind === "DISTRIBUTOR" ? "DISTRIBUTOR" : "SUPER_STOCKIST", partyId: pid })
      .then(setOutstanding)
      .catch(() => setOutstanding(null));
  }

  function next() { setError(null); setStep((s) => s + 1); }
  function back() { setError(null); setStep((s) => Math.max(0, s - 1)); }

  function submit() {
    setBusy(true);
    setError(null);
    const amt = Number(amount);
    const idempotencyKey = key();
    const run = isPartnerFlow
      ? post("guided-receipt", {
          payerType: kind,
          payerId: partyId,
          payeeType: "COMPANY",
          payeeId: "COMPANY",
          amount: amt,
          reference: reference || `${KIND_LABEL[kind!].en} ${date}`,
          paymentMode,
          paymentDate: new Date(date).toISOString(),
          allocateToDocumentId: documentId || undefined,
          reason: notes || `${KIND_LABEL[kind!].en} recorded via Guided Money In`,
          idempotencyKey,
        })
      : post("money-desk-create", {
          purposeCode: kind === "MANUAL" ? "OTHER" : "REC-INS",
          direction: paymentMode === "CASH" ? "CASH_IN" : "BANK_IN",
          amount: amt,
          date: new Date(date).toISOString(),
          treasuryAccountId: treasuryAccountId || undefined,
          counterpartyType: counterpartyName ? "CUSTOMER" : undefined,
          counterpartyName: counterpartyName || undefined,
          description: notes || KIND_LABEL[kind!].en,
          formData: { paymentMode },
          idempotencyKey,
        });
    run
      .then((r) => {
        setResult(hi ? `पोस्ट किया गया${r?.status ? ` — स्थिति: ${r.status}` : ""}` : `Posted${r?.status ? ` — status: ${r.status}` : ""}`);
        router.refresh();
      })
      .catch((err) => setError(err instanceof Error ? err.message : "Could not post"))
      .finally(() => setBusy(false));
  }

  if (result) {
    return (
      <div className={styles.list}>
        <p role="status" data-ok="true">{result}</p>
        <button type="button" className={styles.primaryBig} onClick={onDone}>{hi ? "ठीक है" : "Done"}</button>
      </div>
    );
  }

  return (
    <div className={styles.list}>
      <small>{hi ? `चरण ${step + 1} / 4` : `STEP ${step + 1} of 4`}</small>

      {step === 0 && (
        <div className={styles.list}>
          <strong>{hi ? "किस प्रकार की प्राप्ति?" : "What kind of Money In was this?"}</strong>
          <ul className={styles.list} style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: "0.5rem" }}>
            {(Object.keys(KIND_LABEL) as ReceiptKind[]).map((k) => (
              <li key={k} style={{ listStyle: "none" }}>
                <button type="button" className={styles.secondaryBig} style={{ width: "100%" }} onClick={() => { setKind(k); next(); }}>{hi ? KIND_LABEL[k].hi : KIND_LABEL[k].en}</button>
              </li>
            ))}
          </ul>
          <button type="button" className={styles.secondaryBig} onClick={onCancel}>{hi ? "रद्द करें" : "Cancel"}</button>
        </div>
      )}

      {step === 1 && kind && (
        <div className={styles.list}>
          <strong>{hi ? "किससे प्राप्त हुआ?" : "From whom?"}</strong>
          {isPartnerFlow ? (
            <label>{KIND_LABEL[kind].en}
              <select value={partyId} onChange={(e) => { setPartyId(e.target.value); setDocumentId(""); loadOutstanding(e.target.value); }}>
                <option value="">{parties.length === 0 ? (hi ? "कोई पार्टी नहीं मिली" : "No parties found") : (hi ? "चुनें" : "Select…")}</option>
                {parties.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </label>
          ) : (
            <label>{hi ? "नाम / विवरण" : "Name / description"}<input value={counterpartyName} onChange={(e) => setCounterpartyName(e.target.value)} placeholder={hi ? "ग्राहक का नाम" : "Customer name"} /></label>
          )}
          {isPartnerFlow && partyId && outstanding && (
            <div className={styles.tableWrap}>
              <strong>{hi ? "बकाया चालान" : "Outstanding Invoices"}</strong>
              <table>
                <thead><tr><th></th><th>{hi ? "चालान #" : "Invoice #"}</th><th>{hi ? "देय तिथि" : "Due Date"}</th><th>{hi ? "राशि" : "Amount"}</th></tr></thead>
                <tbody>
                  <tr>
                    <td><input type="radio" name="doc" checked={documentId === ""} onChange={() => setDocumentId("")} /></td>
                    <td colSpan={3}>{hi ? "अनाबंटित / खाते में जमा" : "Unallocated / On-account"}</td>
                  </tr>
                  {outstanding.outstanding.map((d) => (
                    <tr key={d.documentId}>
                      <td><input type="radio" name="doc" checked={documentId === d.documentId} onChange={() => setDocumentId(d.documentId)} /></td>
                      <td>{d.documentNumber}</td>
                      <td>{new Date(d.originalDueDate).toLocaleDateString("en-IN")}</td>
                      <td>{money(d.amount)}</td>
                    </tr>
                  ))}
                  {outstanding.outstanding.length === 0 && <tr><td colSpan={4}>{hi ? "कोई बकाया चालान नहीं — केवल अनाबंटित प्राप्ति संभव है।" : "No outstanding invoices — only an on-account receipt is possible."}</td></tr>}
                </tbody>
              </table>
              <p><small>{hi ? "कुल बकाया" : "Total outstanding"}: {money(outstanding.outstandingTotal)}</small></p>
            </div>
          )}
          <div style={{ display: "flex", gap: "0.5rem" }}>
            <button type="button" className={styles.secondaryBig} onClick={back}>{hi ? "पीछे" : "Back"}</button>
            <button type="button" className={styles.primaryBig} disabled={isPartnerFlow ? !partyId : !counterpartyName} onClick={next}>{hi ? "आगे" : "Next"}</button>
          </div>
        </div>
      )}

      {step === 2 && kind && (
        <div className={styles.list}>
          <strong>{hi ? "भुगतान विवरण" : "Payment Details"}</strong>
          <label>{hi ? "राशि" : "Amount"}<input type="number" step="0.01" min="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} /></label>
          {selectedDoc && Number(amount) > selectedDoc.amount && (
            <p role="status" data-ok="false">{hi ? "राशि इस चालान की बकाया राशि से अधिक है" : "Amount exceeds this invoice's outstanding amount"}</p>
          )}
          <label>{hi ? "ट्रेजरी खाता" : "Treasury Account"}
            {treasuryAccounts.length === 0 ? (
              <span className={styles.emptyHint}>{hi ? "कोई ट्रेजरी खाता कॉन्फ़िगर नहीं है।" : "No Treasury Accounts configured."}</span>
            ) : (
              <select value={treasuryAccountId} onChange={(e) => setTreasuryAccountId(e.target.value)}>
                <option value="">{hi ? "चुनें" : "Choose"}</option>
                {treasuryAccounts.map((t) => <option key={t.id} value={t.id}>{t.name} ({t.kind})</option>)}
              </select>
            )}
          </label>
          <label>{hi ? "भुगतान माध्यम" : "Method"}
            <select value={paymentMode} onChange={(e) => setPaymentMode(e.target.value)}>
              <option value="BANK">{hi ? "बैंक" : "Bank Transfer"}</option>
              <option value="CASH">{hi ? "नकद" : "Cash"}</option>
              <option value="UPI">UPI</option>
              <option value="CHEQUE">{hi ? "चेक" : "Cheque"}</option>
            </select>
          </label>
          <label>{hi ? "संदर्भ / UTR" : "Reference / UTR"}<input value={reference} onChange={(e) => setReference(e.target.value)} /></label>
          <label>{hi ? "तिथि" : "Date"}<input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></label>
          <label>{hi ? "टिप्पणी" : "Notes"}<textarea value={notes} onChange={(e) => setNotes(e.target.value)} /></label>
          <div style={{ display: "flex", gap: "0.5rem" }}>
            <button type="button" className={styles.secondaryBig} onClick={back}>{hi ? "पीछे" : "Back"}</button>
            <button type="button" className={styles.primaryBig} disabled={!amount || Number(amount) <= 0 || (isPartnerFlow && !treasuryAccountId && false)} onClick={next}>{hi ? "समीक्षा करें" : "Review"}</button>
          </div>
        </div>
      )}

      {step === 3 && kind && (
        <div className={styles.list}>
          <strong>{hi ? "समीक्षा और पोस्ट करें" : "Review & Post"}</strong>
          <table>
            <tbody>
              <tr><td>{hi ? "प्रकार" : "Type"}</td><td>{hi ? KIND_LABEL[kind].hi : KIND_LABEL[kind].en}</td></tr>
              <tr><td>{hi ? "पार्टी" : "Party"}</td><td>{isPartnerFlow ? partyName : counterpartyName}</td></tr>
              {isPartnerFlow && <tr><td>{hi ? "चालान / आबंटन" : "Invoice / Allocation"}</td><td>{selectedDoc ? `${selectedDoc.documentNumber} (${money(selectedDoc.amount)} due)` : (hi ? "अनाबंटित / खाते में जमा" : "Unallocated / On-account")}</td></tr>}
              {selectedDoc && <tr><td>{hi ? "पिछला बकाया" : "Outstanding Before"}</td><td>{money(selectedDoc.amount)}</td></tr>}
              <tr><td>{hi ? "प्राप्ति राशि" : "Receipt Amount"}</td><td>{money(amount)}</td></tr>
              {selectedDoc && <tr><td>{hi ? "शेष बकाया" : "Outstanding After"}</td><td>{money(Math.max(0, selectedDoc.amount - Number(amount || 0)))}</td></tr>}
              <tr><td>{hi ? "ट्रेजरी" : "Treasury"}</td><td>{treasuryAccounts.find((t) => t.id === treasuryAccountId)?.name ?? "—"}</td></tr>
              <tr><td>{hi ? "लेजर प्रभाव" : "Ledger Impact"}</td><td>
                {isPartnerFlow
                  ? (selectedDoc ? (hi ? "पार्टी लेजर में क्रेडिट — चालान के विरुद्ध आबंटित" : "Credit to Party Ledger — allocated against the invoice") : (hi ? "पार्टी लेजर में क्रेडिट — अनाबंटित अग्रिम के रूप में" : "Credit to Party Ledger — posted as an on-account advance"))
                  : (hi ? "सामान्य खाता बही में जमा" : "Posted to the general ledger")}
              </td></tr>
            </tbody>
          </table>
          {error && <p role="status" data-ok="false">{error}</p>}
          <div style={{ display: "flex", gap: "0.5rem" }}>
            <button type="button" className={styles.secondaryBig} disabled={busy} onClick={back}>{hi ? "पीछे" : "Back"}</button>
            <button type="button" className={styles.primaryBig} disabled={busy} onClick={submit}>{busy ? (hi ? "पोस्ट हो रहा है…" : "Posting…") : (hi ? "प्राप्ति पोस्ट करें" : "POST RECEIPT")}</button>
          </div>
        </div>
      )}
    </div>
  );
}
