"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import styles from "./WorkflowActions.module.css";
import { SkuSelect, type SkuOption } from "./SkuSelect";

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

export type SSOrderStatusCard = { id: string; orderNumber: string; status: "REQUESTED" | "ACCEPTED" | "DISPATCHED" | "RECEIVED"; total: number; placedAt: string };

export function OrderFromSSWizard({
  language,
  distributorId,
  superStockistName,
  skus,
  recentOrders,
}: {
  language: "EN" | "HI";
  distributorId: string;
  superStockistName: string | null;
  skus: SkuOption[];
  recentOrders: SSOrderStatusCard[];
}) {
  const hi = language === "HI",
    router = useRouter(),
    [lines, setLines] = useState([{ key: key(), skuId: "", quantity: 1 }]),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [submittedOrderNumber, setSubmittedOrderNumber] = useState<string | null>(null),
    [submittedAmounts, setSubmittedAmounts] = useState<{ subtotal: number; taxTotal: number; total: number } | null>(null);

  if (!superStockistName)
    return (
      <section className={styles.panel}>
        <div>
          <small>{hi ? "S.S. से ऑर्डर" : "ORDER FROM S.S."}</small>
          <h2>{hi ? "कोई सक्रिय Super Stockist असाइन नहीं है" : "No active Super Stockist is assigned"}</h2>
        </div>
        <p className={styles.emptyHint} style={{ gridColumn: "2" }}>
          {hi ? "कृपया अपने प्रशासक से संपर्क करें ताकि एक सक्रिय Super Stockist असाइन किया जा सके।" : "Contact your Admin to have an active Super Stockist assigned before ordering."}
        </p>
      </section>
    );

  const validLines = lines.filter((l) => l.skuId && l.quantity > 0);

  return (
    <div className={styles.cardStack}>
      <section className={styles.panel}>
        <div>
          <small>{hi ? "S.S. से ऑर्डर" : "ORDER FROM S.S."}</small>
          <h2>{hi ? "ऑर्डर कर रहे हैं" : "Ordering from"}: {superStockistName}</h2>
        </div>
        {submittedOrderNumber ? (
          <div className={styles.notice} data-ok="true" style={{ gridColumn: "1/-1" }}>
            <p>
              <strong>{hi ? "ऑर्डर सबमिट किया गया" : "Order submitted"}</strong> — {hi ? "S.S. ऑर्डर नंबर" : "S.S. order number"}: <strong>{submittedOrderNumber}</strong>
            </p>
            {submittedAmounts && (
              <p>
                {hi ? "मूल राशि (GST रहित)" : "Basic amount (Excl. GST)"}: ₹{submittedAmounts.subtotal.toFixed(2)} · {hi ? "GST" : "GST"}: ₹{submittedAmounts.taxTotal.toFixed(2)} · <strong>{hi ? "अंतिम राशि" : "Final amount"}: ₹{submittedAmounts.total.toFixed(2)}</strong>
              </p>
            )}
            <span className={styles.badge}>{hi ? "अनुरोधित" : "REQUESTED"}</span>
            <button
              type="button"
              onClick={() => {
                setSubmittedOrderNumber(null);
                setSubmittedAmounts(null);
                setLines([{ key: key(), skuId: "", quantity: 1 }]);
              }}
            >
              {hi ? "एक और ऑर्डर करें" : "Place another order"}
            </button>
          </div>
        ) : (
          <form
            style={{ gridColumn: "1/-1", display: "grid", gap: 12 }}
            onSubmit={(e) => {
              e.preventDefault();
              if (!validLines.length) return;
              setBusy(true);
              setError("");
              void post("create-distributor-replenishment", {
                distributorId,
                idempotencyKey: key(),
                lines: validLines.map(({ skuId, quantity }) => ({ skuId, quantity })),
              })
                .then((order) => {
                  setSubmittedOrderNumber(order.orderNumber ?? null);
                  setSubmittedAmounts({ subtotal: Number(order.subtotal ?? 0), taxTotal: Number(order.taxTotal ?? 0), total: Number(order.total ?? 0) });
                  router.refresh();
                })
                .catch((err) => setError(err instanceof Error ? err.message : "Could not submit order"))
                .finally(() => setBusy(false));
            }}
          >
            <p className={styles.emptyHint} style={{ gridColumn: "1/-1" }}>
              {hi ? "दिखाई गई दरें मूल दरें हैं (GST रहित) — सबमिट करने पर GST अपने-आप जुड़ जाएगा।" : "Rates shown are Basic (Excl. GST) — GST is added automatically on submit."}
            </p>
            {lines.map((line, index) => (
              <fieldset key={line.key} style={{ border: "1px solid #ead8d2", borderRadius: 9, padding: 10, display: "grid", gap: 8 }}>
                <legend>{hi ? `उत्पाद ${index + 1}` : `Product ${index + 1}`}</legend>
                <label>
                  {hi ? "SEERA / MUV — उत्पाद" : "SEERA / MUV — Product"}
                  <SkuSelect
                    language={language}
                    skus={skus}
                    value={line.skuId}
                    onChange={(v) => setLines((c) => c.map((x) => (x.key === line.key ? { ...x, skuId: v } : x)))}
                    required
                  />
                </label>
                <label>
                  {hi ? "मात्रा" : "Quantity"}
                  <input
                    type="number"
                    min={1}
                    step="1"
                    value={line.quantity}
                    onChange={(e) => setLines((c) => c.map((x) => (x.key === line.key ? { ...x, quantity: Number(e.target.value) } : x)))}
                    required
                  />
                </label>
                {lines.length > 1 && (
                  <button type="button" onClick={() => setLines((c) => c.filter((x) => x.key !== line.key))}>
                    {hi ? "हटाएँ" : "Remove"}
                  </button>
                )}
              </fieldset>
            ))}
            <button type="button" onClick={() => setLines((c) => [...c, { key: key(), skuId: "", quantity: 1 }])}>
              {hi ? "+ उत्पाद जोड़ें" : "+ Add product"}
            </button>
            <button disabled={busy || !validLines.length} className={styles.primaryBig}>
              {hi ? "ऑर्डर सबमिट करें" : "SUBMIT ORDER"}
            </button>
            {error && <p role="status" className={styles.cardError}>{error}</p>}
          </form>
        )}
      </section>
      {recentOrders.length > 0 && (
        <section>
          <h2>{hi ? "हाल के S.S. ऑर्डर" : "Recent S.S. orders"}</h2>
          {recentOrders.map((o) => (
            <article key={o.id} className={styles.orderCard}>
              <header>
                <div>
                  <strong>{o.orderNumber}</strong>
                  <small>₹{o.total.toFixed(2)} · {o.placedAt}</small>
                </div>
                <span className={styles.badge}>{hi ? { REQUESTED: "अनुरोधित", ACCEPTED: "स्वीकृत", DISPATCHED: "डिस्पैच", RECEIVED: "प्राप्त" }[o.status] : o.status}</span>
              </header>
            </article>
          ))}
        </section>
      )}
    </div>
  );
}
