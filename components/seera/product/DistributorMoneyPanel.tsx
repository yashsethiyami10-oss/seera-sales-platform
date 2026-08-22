"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import styles from "./WorkflowActions.module.css";

async function post(action: string, payload: unknown) {
  const r = await fetch("/api/distribution/operations", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, payload }) });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d?.error?.message ?? d?.error?.code ?? "Action failed");
  return d;
}

const money = (v: number) => `₹${v.toLocaleString("en-IN")}`;
const key = () => crypto.randomUUID();

export type MoneySnapshot = {
  outstanding: number;
  current: number;
  overdue: number;
  oldestDueDate: string | null;
  lastPayment: { amount: number; postedAt: string } | null;
  lastPaymentStatus: string | null;
  receipt: { id: string; documentNumber: string } | null;
  promisedPaymentDate: string | null;
  creditStatus: string | null;
  availableCredit: number | null;
  creditLimit: number | null;
  openOrders: { id: string; orderNumber: string; total: number; originalDueDate: string | null }[];
};

export function DistributorMoneyPanel({ language, distributorId, snapshot }: { language: "EN" | "HI"; distributorId: string; snapshot: MoneySnapshot }) {
  const hi = language === "HI",
    router = useRouter(),
    [showStatement, setShowStatement] = useState(false),
    [showPayment, setShowPayment] = useState(false),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const fmtDate = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString(hi ? "hi-IN" : "en-IN") : "—");

  return (
    <section className={styles.panel}>
      <div>
        <small>{hi ? "पैसा" : "MONEY"}</small>
        <h2>{hi ? "आपका खाता" : "Your account"}</h2>
      </div>
      {/* P0-3 correction (Founder decision 22-Aug): the single "Outstanding" card previously
          merged an ambiguous number — it is actually the Distributor's own exposure to its
          Super Stockist (order-value based, netted against POSTED ledger entries — see
          canonicalDistributorExposure), not "what retailers owe the Distributor." There is no
          reliable retailer-receivable ledger in this codebase today (RETAILER_ORDER has no
          payment-collection tracking), so that card is shown honestly as unavailable rather than
          invented. Credit Limit/Available Credit show explicit "Not configured"/"Not applicable"
          text instead of a bare dash, so an unconfigured credit facility never reads as ₹0. */}
      <div className={styles.notice} data-ok="true" style={{ gridColumn: "1/-1" }}>
        <dl style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(150px,1fr))" }}>
          <div><dt>{hi ? "रिटेलर से प्राप्य" : "Receivable from retailers"}</dt><dd>{hi ? "उपलब्ध नहीं (अभी लेजर में ट्रैक नहीं)" : "Not available (not yet ledger-tracked)"}</dd></div>
          <div><dt>{hi ? "S.S. को देय" : "Payable to S.S."}</dt><dd>{money(snapshot.outstanding)}</dd></div>
          <div><dt>{hi ? "अतिदेय" : "Overdue"}</dt><dd>{money(snapshot.overdue)}</dd></div>
          <div><dt>{hi ? "क्रेडिट सीमा" : "Credit limit"}</dt><dd>{snapshot.creditLimit == null ? (hi ? "कॉन्फ़िगर नहीं" : "Not configured") : money(snapshot.creditLimit)}</dd></div>
          <div><dt>{hi ? "उपलब्ध क्रेडिट" : "Available credit"}</dt><dd>{snapshot.availableCredit == null ? (hi ? "लागू नहीं" : "Not applicable") : money(snapshot.availableCredit)}</dd></div>
          <div><dt>{hi ? "सबसे पुरानी देय तारीख" : "Oldest due"}</dt><dd>{fmtDate(snapshot.oldestDueDate)}</dd></div>
          <div><dt>{hi ? "अंतिम भुगतान" : "Last payment"}</dt><dd>{snapshot.lastPayment ? `${money(snapshot.lastPayment.amount)} · ${fmtDate(snapshot.lastPayment.postedAt)}` : "—"}</dd></div>
          <div><dt>{hi ? "अगली वादा तारीख" : "Next promise"}</dt><dd>{fmtDate(snapshot.promisedPaymentDate)}</dd></div>
          <div><dt>{hi ? "क्रेडिट स्थिति" : "Status"}</dt><dd>{snapshot.creditStatus ?? "—"}</dd></div>
          {snapshot.lastPaymentStatus && (
            <div>
              <dt>{hi ? "भुगतान सत्यापन" : "Payment verification"}</dt>
              <dd>
                {snapshot.lastPaymentStatus === "VERIFIED" || snapshot.lastPaymentStatus === "PARTIALLY_MATCHED"
                  ? hi
                    ? "सत्यापित"
                    : "Verified"
                  : snapshot.lastPaymentStatus === "REJECTED"
                    ? hi
                      ? "अस्वीकृत"
                      : "Rejected"
                    : hi
                      ? "सत्यापन लंबित"
                      : "Pending verification"}
              </dd>
            </div>
          )}
        </dl>
        {snapshot.receipt && (
          <p className={styles.emptyHint} style={{ background: "#effaf2", color: "#177245" }}>
            {hi ? "रसीद तैयार है" : "Receipt is ready"} — {snapshot.receipt.documentNumber}{" "}
            <a href={`/api/documents/${snapshot.receipt.id}/download`} target="_blank" rel="noreferrer">
              {hi ? "रसीद देखें" : "View receipt"}
            </a>
          </p>
        )}
        <div className={styles.inlineActions}>
          <button type="button" onClick={() => setShowStatement((v) => !v)}>{showStatement ? (hi ? "विवरण छुपाएं" : "Hide statement") : hi ? "विवरण देखें" : "VIEW STATEMENT"}</button>
          <button type="button" onClick={() => setShowPayment((v) => !v)}>{hi ? "भुगतान विवरण" : "PAYMENT DETAILS"}</button>
        </div>
        {showStatement && (
          <div className={styles.tableWrap}>
            <table>
              <thead><tr><th>{hi ? "ऑर्डर" : "Order"}</th><th>{hi ? "राशि" : "Amount"}</th><th>{hi ? "देय तारीख" : "Due"}</th></tr></thead>
              <tbody>
                {snapshot.openOrders.length === 0 && <tr><td colSpan={3}>{hi ? "कोई बकाया ऑर्डर नहीं" : "No due orders."}</td></tr>}
                {snapshot.openOrders.map((o) => (
                  <tr key={o.id}><td>{o.orderNumber}</td><td>{money(o.total)}</td><td>{fmtDate(o.originalDueDate)}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {showPayment && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              setBusy(true);
              setMessage(null);
              void post("submit-partner-payment", {
                partnerType: "DISTRIBUTOR",
                partnerId: distributorId,
                amount: Number(f.get("amount")),
                reference: String(f.get("reference")),
                paymentMode: String(f.get("paymentMode")),
                paymentDate: String(f.get("paymentDate")),
                idempotencyKey: key(),
              })
                .then(() => {
                  setMessage({ ok: true, text: hi ? "भुगतान जानकारी सबमिट की गई।" : "Payment info submitted." });
                  router.refresh();
                })
                .catch((err) => setMessage({ ok: false, text: err instanceof Error ? err.message : "Could not submit" }))
                .finally(() => setBusy(false));
            }}
          >
            <label>{hi ? "राशि" : "Amount"}<input name="amount" type="number" min="0.01" step="0.01" required /></label>
            <label>{hi ? "भुगतान माध्यम" : "Payment mode"}<input name="paymentMode" required /></label>
            <label>{hi ? "तारीख" : "Payment date"}<input name="paymentDate" type="date" required /></label>
            <label>{hi ? "बैंक / UTR संदर्भ" : "Bank / UTR reference"}<input name="reference" minLength={3} required /></label>
            <button disabled={busy}>{hi ? "भुगतान जानकारी सहेजें" : "RECORD PAYMENT INFO"}</button>
          </form>
        )}
        {message && <p role="status" data-ok={message.ok}>{message.text}</p>}
      </div>
    </section>
  );
}
