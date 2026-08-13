"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import styles from "./WorkflowActions.module.css";

type LedgerEntry = { id: string; type: string; amount: number; direction: string; postedAt: string | null; reason: string };
type VerifiedPayment = {
  id: string;
  paymentNumber: string;
  amount: number;
  reference: string;
  paymentMode: string;
  paymentDate: string;
  receiptDocumentId: string | null;
  receiptDocumentNumber: string | null;
};
type Snapshot = {
  distributorName: string;
  outstanding: number;
  current: number;
  overdue: number;
  oldestDueDate: string | null;
  lastPayment: { amount: number; postedAt: string } | null;
  promisedPaymentDate: string | null;
  creditStatus: string | null;
  availableCredit: number | null;
  oldestOpenOrderId: string | null;
  recentLedger: LedgerEntry[];
};

async function send(endpoint: string, body: unknown) {
  const response = await fetch(endpoint, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data?.error?.message ?? data?.error?.code ?? "Action failed");
  return data;
}

const money = (v: number) => `₹${v.toLocaleString("en-IN")}`;

export function CollectionsPanel({
  language,
  base,
  distributors,
  selectedDistributorId,
  snapshot,
  selectedDistributorPartnerId,
  superStockistId,
  verifiedPayments = [],
}: {
  language: "EN" | "HI";
  base: string;
  distributors: { value: string; label: string }[];
  selectedDistributorId?: string;
  snapshot: Snapshot | null;
  // Distributor's own partner id (== selectedDistributorId today, kept distinct in case a future
  // caller keys the picker by something else) — needed by the reminder action below.
  selectedDistributorPartnerId?: string;
  // Only provided when this panel is rendered from the S.S. portal — Manager is purely
  // supervisory and does not get a reminder-send action.
  superStockistId?: string;
  // GENERATE RECEIPT: only populated (and only rendered) alongside superStockistId — verified/
  // posted payments from the selected Distributor, each already carrying its own receipt state.
  verifiedPayments?: VerifiedPayment[];
}) {
  const hi = language === "HI",
    router = useRouter(),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null),
    [showStatement, setShowStatement] = useState(false);
  const sendReminder = async (template: "PAYMENT_REMINDER" | "OVERDUE_WARNING" | "PROMISE_MISSED") => {
    if (!superStockistId || !selectedDistributorPartnerId) return;
    setBusy(true);
    setMessage(null);
    try {
      await fetch("/api/distribution/operations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "send-payment-reminder", payload: { superStockistId, distributorId: selectedDistributorPartnerId, template } }),
      }).then(async (r) => {
        const d = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(d?.error?.message ?? "Could not queue reminder");
      });
      setMessage({ ok: true, text: hi ? "अनुस्मारक कतारबद्ध किया गया।" : "Reminder queued." });
      router.refresh();
    } catch (e) {
      setMessage({ ok: false, text: e instanceof Error ? e.message : "Could not send reminder" });
    } finally {
      setBusy(false);
    }
  };
  const generateReceipt = async (paymentId: string) => {
    if (!superStockistId) return;
    setBusy(true);
    setMessage(null);
    try {
      await send("/api/distribution/operations", { action: "generate-distributor-receipt", payload: { superStockistId, paymentId, idempotencyKey: `receipt-${paymentId}` } });
      setMessage({ ok: true, text: hi ? "रसीद जारी की गई।" : "Receipt issued." });
      router.refresh();
    } catch (e) {
      setMessage({ ok: false, text: e instanceof Error ? e.message : "Could not generate receipt" });
    } finally {
      setBusy(false);
    }
  };
  const fmtDate = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString(hi ? "hi-IN" : "en-IN") : "—");
  return (
    <section className={styles.panel}>
      <div>
        <small>{hi ? "संग्रह" : "COLLECTIONS"}</small>
        <h2>{hi ? "वितरक चुनें" : "Choose a distributor"}</h2>
      </div>
      <form method="get" action={base}>
        <label>
          {hi ? "वितरक" : "Distributor"}
          <select name="distributorId" defaultValue={selectedDistributorId ?? ""} required>
            <option value="">{hi ? "नाम से खोजें" : "Search by name"}</option>
            {distributors.map((d) => (
              <option key={d.value} value={d.value}>
                {d.label}
              </option>
            ))}
          </select>
        </label>
        {!distributors.length && (
          <p className={styles.emptyHint}>
            {hi ? "इस टीम की कोई रिटेलर मैप वितरक से जुड़ी नहीं है।" : "No retailer on this team is mapped to a distributor yet."}
          </p>
        )}
        <button>{hi ? "देखें" : "View"}</button>
      </form>
      {selectedDistributorId && !snapshot && (
        <p className={styles.emptyHint}>{hi ? "इस वितरक के लिए डेटा लोड नहीं हो सका। पुनः प्रयास करें।" : "Could not load this distributor. Please retry."}</p>
      )}
      {snapshot && (
        <div className={styles.notice} data-ok="true" style={{ gridColumn: "1/-1" }}>
          <p>
            <strong>{snapshot.distributorName}</strong>
          </p>
          <dl className={styles.list} style={{ gridTemplateColumns: "repeat(auto-fit,minmax(160px,1fr))", display: "grid" }}>
            <div>
              <dt>{hi ? "कुल बकाया" : "Total outstanding"}</dt>
              <dd>{money(snapshot.outstanding)}</dd>
            </div>
            <div>
              <dt>{hi ? "चालू" : "Current"}</dt>
              <dd>{money(snapshot.current)}</dd>
            </div>
            <div>
              <dt>{hi ? "अतिदेय" : "Overdue"}</dt>
              <dd>{money(snapshot.overdue)}</dd>
            </div>
            <div>
              <dt>{hi ? "सबसे पुरानी देय तारीख" : "Oldest due"}</dt>
              <dd>{fmtDate(snapshot.oldestDueDate)}</dd>
            </div>
            <div>
              <dt>{hi ? "अंतिम भुगतान" : "Last payment"}</dt>
              <dd>{snapshot.lastPayment ? `${money(snapshot.lastPayment.amount)} · ${fmtDate(snapshot.lastPayment.postedAt)}` : "—"}</dd>
            </div>
            <div>
              <dt>{hi ? "वादा तारीख" : "Promise date"}</dt>
              <dd>{fmtDate(snapshot.promisedPaymentDate)}</dd>
            </div>
            <div>
              <dt>{hi ? "क्रेडिट स्थिति" : "Credit status"}</dt>
              <dd>{snapshot.creditStatus ?? "—"}</dd>
            </div>
            <div>
              <dt>{hi ? "उपलब्ध क्रेडिट" : "Available credit"}</dt>
              <dd>{snapshot.availableCredit == null ? "—" : money(snapshot.availableCredit)}</dd>
            </div>
          </dl>
          <div className={styles.inlineActions}>
            <button type="button" onClick={() => setShowStatement((v) => !v)}>
              {showStatement ? (hi ? "विवरण छुपाएं" : "Hide statement") : hi ? "विवरण देखें" : "View statement"}
            </button>
            {superStockistId && (
              <button type="button" disabled={busy} onClick={() => void sendReminder(snapshot.overdue > 0 ? "OVERDUE_WARNING" : "PAYMENT_REMINDER")}>
                {hi ? "भुगतान अनुस्मारक भेजें" : "SEND PAYMENT REMINDER"}
              </button>
            )}
          </div>
          {showStatement && (
            <div className={styles.tableWrap}>
              <table>
                <thead>
                  <tr>
                    <th>{hi ? "तारीख" : "Date"}</th>
                    <th>{hi ? "प्रकार" : "Type"}</th>
                    <th>{hi ? "दिशा" : "Direction"}</th>
                    <th>{hi ? "राशि" : "Amount"}</th>
                    <th>{hi ? "कारण" : "Reason"}</th>
                  </tr>
                </thead>
                <tbody>
                  {snapshot.recentLedger.length === 0 && (
                    <tr>
                      <td colSpan={5}>{hi ? "कोई लेनदेन दर्ज नहीं।" : "No ledger entries recorded."}</td>
                    </tr>
                  )}
                  {snapshot.recentLedger.map((e) => (
                    <tr key={e.id}>
                      <td>{fmtDate(e.postedAt)}</td>
                      <td>{e.type}</td>
                      <td>{e.direction}</td>
                      <td>{money(e.amount)}</td>
                      <td>{e.reason}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {superStockistId && verifiedPayments.length > 0 && (
            <div className={styles.tableWrap}>
              <h3>{hi ? "सत्यापित भुगतान — रसीद" : "Verified payments — receipts"}</h3>
              <table>
                <thead>
                  <tr>
                    <th>{hi ? "तारीख" : "Date"}</th>
                    <th>{hi ? "राशि" : "Amount"}</th>
                    <th>{hi ? "तरीका" : "Mode"}</th>
                    <th>{hi ? "संदर्भ" : "Reference"}</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {verifiedPayments.map((p) => (
                    <tr key={p.id}>
                      <td>{fmtDate(p.paymentDate)}</td>
                      <td>{money(p.amount)}</td>
                      <td>{p.paymentMode}</td>
                      <td>{p.reference}</td>
                      <td>
                        {p.receiptDocumentId ? (
                          <a href={`/api/documents/${p.receiptDocumentId}/download`} target="_blank" rel="noreferrer">
                            {hi ? `रसीद ${p.receiptDocumentNumber} · पीडीएफ` : `Receipt ${p.receiptDocumentNumber} · PDF`}
                          </a>
                        ) : (
                          <button type="button" disabled={busy} onClick={() => void generateReceipt(p.id)}>
                            {hi ? "रसीद बनाएं" : "GENERATE RECEIPT"}
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {snapshot.oldestOpenOrderId ? (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                const f = new FormData(e.currentTarget);
                setBusy(true);
                setMessage(null);
                void send(
                  superStockistId ? "/api/distribution/operations" : "/api/manager/operations",
                  {
                    action: "record-payment-promise",
                    payload: superStockistId
                      ? {
                          orderId: snapshot.oldestOpenOrderId,
                          partyId: superStockistId,
                          promisedPaymentDate: String(f.get("promisedPaymentDate")),
                          reason: String(f.get("reason")),
                          sourcePortal: "super-stockist",
                        }
                      : {
                          orderId: snapshot.oldestOpenOrderId,
                          promisedPaymentDate: String(f.get("promisedPaymentDate")),
                          reason: String(f.get("reason")),
                        },
                  },
                )
                  .then(() => {
                    setMessage({ ok: true, text: hi ? "भुगतान वादा दर्ज किया गया।" : "Payment promise recorded." });
                    router.refresh();
                  })
                  .catch((err) => setMessage({ ok: false, text: err instanceof Error ? err.message : "Could not record" }))
                  .finally(() => setBusy(false));
              }}
            >
              <label>
                {hi ? "वादा भुगतान तारीख" : "Promised payment date"}
                <input type="date" name="promisedPaymentDate" required />
              </label>
              <label>
                {hi ? "कारण / नोट / फॉलो-अप" : "Reason / note / follow-up"}
                <input name="reason" required minLength={3} />
              </label>
              <button disabled={busy}>{hi ? "भुगतान वादा दर्ज करें" : "Record payment promise"}</button>
            </form>
          ) : (
            <p className={styles.emptyHint}>{hi ? "इस वितरक के लिए कोई खुला ऑर्डर नहीं है।" : "This distributor has no open order to record a promise against."}</p>
          )}
        </div>
      )}
      {message && (
        <p role="status" data-ok={message.ok}>
          {message.text}
        </p>
      )}
    </section>
  );
}
