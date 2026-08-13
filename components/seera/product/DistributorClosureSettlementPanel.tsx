"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import styles from "./WorkflowActions.module.css";

const key = () => crypto.randomUUID();
async function post(action: string, payload: unknown) {
  const r = await fetch("/api/distribution/operations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, payload }),
    }),
    d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d?.error?.message ?? d?.error?.code ?? "Action failed");
  return d;
}

// STAGE 14 — Distributor Closure Stock Settlement. Founder decision: "No routine Company return
// program. Only Distributor Closure Stock Settlement" — the governed way to zero out a closing
// Distributor's remaining physical stock (take it back to their assigned Super Stockist) BEFORE
// the partner lifecycle CLOSE action, rather than the previous silent write-off (obligations.stock
// was always hardcoded 0, so CLOSE never actually checked). Only rendered when totalUnits > 0.
export function DistributorClosureSettlementPanel({
  language,
  distributorId,
  totalUnits,
  lines,
  receivingSuperStockist,
}: {
  language: "EN" | "HI";
  distributorId: string;
  totalUnits: number;
  lines: { skuId: string; code: string; productName: string; onHand: number }[];
  receivingSuperStockist: { value: string; label: string } | null;
}) {
  const hi = language === "HI",
    router = useRouter(),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  return (
    <section className={styles.panel}>
      <div>
        <small>{hi ? "क्लोज़र स्टॉक निपटान" : "CLOSURE STOCK SETTLEMENT"}</small>
        <h2>{hi ? "वितरक की शेष भौतिक स्टॉक" : "Distributor's remaining physical stock"}</h2>
      </div>
      <p role="alert" className={styles.cardError} style={{ gridColumn: "1 / -1" }}>
        {hi
          ? `${totalUnits} भौतिक इकाइयाँ अभी भी इस वितरक के पास हैं — इन्हें वापस लिए बिना पार्टनर को बंद (CLOSE) नहीं किया जा सकता।`
          : `${totalUnits} physical units are still on hand with this Distributor — CLOSE is blocked until this stock is taken back.`}
      </p>
      <div className={styles.tableWrap} style={{ gridColumn: "1 / -1" }}>
        <table>
          <thead>
            <tr>
              <th>{hi ? "एसकेयू" : "SKU"}</th>
              <th>{hi ? "उत्पाद" : "Product"}</th>
              <th>{hi ? "उपलब्ध मात्रा" : "On hand"}</th>
            </tr>
          </thead>
          <tbody>
            {lines.map((l) => (
              <tr key={l.skuId}>
                <td>{l.code}</td>
                <td>{l.productName}</td>
                <td>{l.onHand}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {receivingSuperStockist ? (
        <form
          style={{ gridColumn: "1 / -1", display: "grid", gap: 10 }}
          onSubmit={(e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            setBusy(true);
            setMessage(null);
            void post("settle-closure-stock", {
              distributorId,
              receivingSuperStockistId: receivingSuperStockist.value,
              reason: String(f.get("reason") || ""),
              idempotencyKey: key(),
            })
              .then(() => {
                setMessage({ ok: true, text: hi ? "स्टॉक वापस ले लिया गया।" : "Stock taken back successfully." });
                router.refresh();
              })
              .catch((err) => setMessage({ ok: false, text: err instanceof Error ? err.message : "Could not settle closure stock" }))
              .finally(() => setBusy(false));
          }}
        >
          <label>
            {hi ? "प्राप्तकर्ता सुपर स्टॉकिस्ट" : "Receiving Super Stockist"}
            <input value={receivingSuperStockist.label} readOnly />
          </label>
          <label>
            {hi ? "कारण" : "Reason"}
            <input name="reason" minLength={3} required placeholder={hi ? "उदा. वितरक बंद किया जा रहा है" : "e.g. Distributor relationship is being closed"} />
          </label>
          <button disabled={busy} className={styles.primaryBig}>
            {hi ? "स्टॉक वापस लें" : "TAKE BACK CLOSING STOCK"}
          </button>
        </form>
      ) : (
        <p className={styles.readOnly} style={{ gridColumn: "1 / -1" }}>
          {hi
            ? "इस वितरक का कोई सक्रिय सुपर स्टॉकिस्ट असाइनमेंट नहीं है — वापसी से पहले असाइन करें।"
            : "This Distributor has no active Super Stockist assignment — assign one before taking back stock."}
        </p>
      )}
      {message && (
        <p role="status" data-ok={message.ok} style={{ gridColumn: "1 / -1" }}>
          {message.text}
        </p>
      )}
    </section>
  );
}
