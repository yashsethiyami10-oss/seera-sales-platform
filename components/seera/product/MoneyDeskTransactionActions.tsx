"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import styles from "./WorkflowActions.module.css";

async function post(action: string, payload: unknown) {
  const r = await fetch("/api/finance/company-operations", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, payload }) });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d?.error?.message ?? d?.error?.code ?? "Action failed");
  return d;
}

// Money Desk 2.0 (Part 25) — the Transaction Detail page was read-only: it showed "Requires
// Independent Approval" / "Voided By" fields but had no actual Approve/Reject/Void/Edit buttons
// anywhere in the app. This is the real action surface for the server-side lifecycle
// (decideMoneyDeskApproval/voidMoneyDeskTransaction/editMoneyDeskTransaction) that already existed
// but was unreachable from any UI. `can*` flags are server-computed (moneyDeskTransactionDetail) —
// this component only decides which buttons to SHOW; the real authorization boundary is still each
// server action's own authorize()/permission check, unchanged.
export function MoneyDeskTransactionActions({
  language,
  transactionId,
  amount,
  canApprove,
  canVoid,
  canEdit,
  canRetry,
  treasuryAccounts = [],
}: {
  language: "EN" | "HI";
  transactionId: string;
  amount: number;
  canApprove: boolean;
  canVoid: boolean;
  canEdit: boolean;
  canRetry: boolean;
  // Part L — populated only when canEdit; lets a "Needs Attention" entry stuck for want of a
  // treasury account (requireTreasuryAccountId) actually be corrected, not just endlessly retried.
  treasuryAccounts?: { id: string; name: string; kind: string }[];
}) {
  const hi = language === "HI";
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [editing, setEditing] = useState(false);
  const [editAmount, setEditAmount] = useState(String(amount));
  const [editReason, setEditReason] = useState("");
  const [editTreasuryAccountId, setEditTreasuryAccountId] = useState("");

  function decide(decision: "APPROVED" | "REJECTED") {
    const reason = window.prompt(hi ? "कारण दर्ज करें" : "Enter a reason") ?? "";
    if (!reason.trim()) return;
    setBusy(true);
    setMessage(null);
    post("money-desk-decide-approval", { transactionId, decision, reason })
      .then(() => { setMessage({ ok: true, text: decision === "APPROVED" ? (hi ? "स्वीकृत।" : "Approved.") : (hi ? "अस्वीकृत।" : "Rejected.") }); router.refresh(); })
      .catch((e) => setMessage({ ok: false, text: e instanceof Error ? e.message : "Could not decide" }))
      .finally(() => setBusy(false));
  }

  function voidTransaction() {
    const reason = window.prompt(hi ? "रद्द करने का कारण दर्ज करें" : "Enter a reason for voiding this transaction") ?? "";
    if (!reason.trim()) return;
    if (!window.confirm(hi ? "यह लेनदेन रद्द करें? मूल रिकॉर्ड सुरक्षित रहेगा, केवल इसे उलटा जाएगा।" : "Void this transaction? The original record is preserved, only reversed.")) return;
    setBusy(true);
    setMessage(null);
    post("money-desk-void", { transactionId, reason })
      .then(() => { setMessage({ ok: true, text: hi ? "रद्द किया गया।" : "Voided." }); router.refresh(); })
      .catch((e) => setMessage({ ok: false, text: e instanceof Error ? e.message : "Could not void" }))
      .finally(() => setBusy(false));
  }

  function retry() {
    setBusy(true);
    setMessage(null);
    post("money-desk-retry", { transactionId })
      .then(() => { setMessage({ ok: true, text: hi ? "पुनः प्रयास सफल — पोस्ट किया गया।" : "Retry succeeded — POSTED." }); router.refresh(); })
      .catch((e) => setMessage({ ok: false, text: e instanceof Error ? e.message : "Retry failed — the underlying issue may still need fixing" }))
      .finally(() => setBusy(false));
  }

  function submitEdit() {
    if (!editReason.trim()) { setMessage({ ok: false, text: hi ? "कारण आवश्यक है" : "A reason is required" }); return; }
    setBusy(true);
    setMessage(null);
    post("money-desk-edit", { transactionId, amount: Number(editAmount) || undefined, treasuryAccountId: editTreasuryAccountId || undefined, reason: editReason, idempotencyKey: crypto.randomUUID() })
      .then((result: { id: string; correctionOfId?: string }) => {
        setMessage({ ok: true, text: result.correctionOfId ? (hi ? "सुधार दर्ज किया गया — मूल को रद्द कर नया लेनदेन बनाया गया।" : "Correction recorded — the original was voided and a new corrected transaction created.") : (hi ? "अपडेट किया गया।" : "Updated.") });
        setEditing(false);
        router.refresh();
      })
      .catch((e) => setMessage({ ok: false, text: e instanceof Error ? e.message : "Could not edit" }))
      .finally(() => setBusy(false));
  }

  if (!canApprove && !canVoid && !canEdit && !canRetry) return null;

  return (
    <section className={styles.panel}>
      <div>
        <small>{hi ? "कार्रवाई" : "ACTIONS"}</small>
        <h2>{hi ? "लेनदेन कार्रवाई" : "Transaction Actions"}</h2>
      </div>
      {message && <p role="status" data-ok={message.ok}>{message.text}</p>}
      <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
        {canApprove && (
          <>
            <button type="button" className={styles.primaryBig} disabled={busy} onClick={() => decide("APPROVED")}>{hi ? "स्वीकृत करें" : "APPROVE"}</button>
            <button type="button" className={styles.secondaryBig} disabled={busy} onClick={() => decide("REJECTED")}>{hi ? "अस्वीकार करें" : "REJECT"}</button>
          </>
        )}
        {canVoid && <button type="button" className={styles.secondaryBig} disabled={busy} onClick={voidTransaction}>{hi ? "रद्द करें (वॉइड)" : "VOID"}</button>}
        {canRetry && <button type="button" className={styles.primaryBig} disabled={busy} onClick={retry}>{busy ? (hi ? "पुनः प्रयास हो रहा है…" : "Retrying…") : (hi ? "पुनः प्रयास करें" : "RETRY")}</button>}
        {canEdit && !editing && <button type="button" className={styles.secondaryBig} disabled={busy} onClick={() => setEditing(true)}>{hi ? "संपादित / सुधार करें" : "EDIT / CORRECT"}</button>}
      </div>
      {canEdit && editing && (
        <div className={styles.list} style={{ marginTop: "0.75rem" }}>
          <p><small>{hi ? "यदि यह लेनदेन पहले से पोस्ट हो चुका है, तो यह मूल को रद्द कर एक नया सुधारित लेनदेन बनाएगा (मूल हमेशा सुरक्षित रहता है)।" : "If this transaction is already posted, this will void the original and create a new, corrected transaction (the original is always preserved)."}</small></p>
          <label>{hi ? "नई राशि" : "New amount"}<input type="number" step="0.01" value={editAmount} onChange={(e) => setEditAmount(e.target.value)} /></label>
          {treasuryAccounts.length > 0 && (
            <label>{hi ? "कैश/बैंक खाता" : "Cash/Bank account"}
              <select value={editTreasuryAccountId} onChange={(e) => setEditTreasuryAccountId(e.target.value)}>
                <option value="">{hi ? "अपरिवर्तित छोड़ें" : "Leave unchanged"}</option>
                {treasuryAccounts.map((a) => <option key={a.id} value={a.id}>{a.name} ({a.kind})</option>)}
              </select>
            </label>
          )}
          <label>{hi ? "सुधार का कारण *" : "Reason for correction *"}<input value={editReason} onChange={(e) => setEditReason(e.target.value)} required /></label>
          <div style={{ display: "flex", gap: "0.5rem" }}>
            <button type="button" className={styles.secondaryBig} disabled={busy} onClick={() => setEditing(false)}>{hi ? "रद्द करें" : "Cancel"}</button>
            <button type="button" className={styles.primaryBig} disabled={busy || !editReason.trim()} onClick={submitEdit}>{busy ? (hi ? "सहेजा जा रहा है…" : "Saving…") : (hi ? "सुधार सहेजें" : "Save Correction")}</button>
          </div>
        </div>
      )}
    </section>
  );
}
