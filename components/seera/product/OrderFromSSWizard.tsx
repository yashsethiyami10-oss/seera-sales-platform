"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import styles from "./WorkflowActions.module.css";
import type { SkuOption } from "./SkuSelect";
import { QuickOrderPicker } from "./QuickOrderPicker";

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
  lastOrderLines = [],
}: {
  language: "EN" | "HI";
  distributorId: string;
  superStockistName: string | null;
  skus: SkuOption[];
  recentOrders: SSOrderStatusCard[];
  // Lines of the most recent order to this S.S., for one-tap "Repeat last order".
  lastOrderLines?: { skuId: string; quantity: number }[];
}) {
  const hi = language === "HI",
    router = useRouter(),
    [quantities, setQuantities] = useState<Record<string, number>>({}),
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

  const validLines = Object.entries(quantities)
    .filter(([, quantity]) => quantity > 0)
    .map(([skuId, quantity]) => ({ skuId, quantity }));

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
                {/* P0-4 correction: an order can mix Seera (basic ex-GST) and MUV (GST-inclusive)
                    lines, so this can't claim one universal "Basic (Excl. GST)" label — Taxable
                    value/GST/Final are true for both modes. */}
                {hi ? "कर योग्य राशि" : "Taxable value"}: ₹{submittedAmounts.subtotal.toFixed(2)} · GST: ₹{submittedAmounts.taxTotal.toFixed(2)} · <strong>{hi ? "अंतिम राशि" : "Final amount"}: ₹{submittedAmounts.total.toFixed(2)}</strong>
              </p>
            )}
            <span className={styles.badge}>{hi ? "अनुरोधित" : "REQUESTED"}</span>
            <button
              type="button"
              onClick={() => {
                setSubmittedOrderNumber(null);
                setSubmittedAmounts(null);
                setQuantities({});
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
                lines: validLines,
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
              {hi
                ? "Seera दरें मूल हैं (GST अलग से जुड़ेगा); MUV दरें अंतिम/GST सहित हैं (कोई अतिरिक्त GST नहीं जुड़ेगा) — प्रत्येक उत्पाद के आगे दर मोड दिखाया गया है।"
                : "Seera rates are Basic — GST is added on submit. MUV rates are already Final/GST-inclusive — no GST is added on top. The rate mode is shown next to each product."}
            </p>
            <QuickOrderPicker
              language={language}
              skus={skus}
              quantities={quantities}
              onChange={setQuantities}
              lastOrderLines={lastOrderLines}
              busy={busy}
              submitLabel={hi ? "ऑर्डर भेजें" : "Send order"}
            />
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
