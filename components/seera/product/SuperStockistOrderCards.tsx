"use client";
import Link from "next/link";
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

export type SsPendingLine = { id: string; label: string; unit: string; ordered: number; available: number; rate: number; lineTotal: number };
export type SsCredit = { limit: number; used: number; available: number | null; overdue: number; status: string | null };
export type SsPendingOrder = {
  id: string;
  superStockistId: string;
  orderNumber: string;
  distributor: string;
  territory: string | null;
  placedAt: string;
  cashOrCredit: string;
  orderTotal: number;
  credit: SsCredit;
  lines: SsPendingLine[];
};

function DecisionCard({ order, language, dispatchHref }: { order: SsPendingOrder; language: "EN" | "HI"; dispatchHref: string }) {
  const hi = language === "HI",
    router = useRouter(),
    [qty, setQty] = useState<Record<string, number>>(() =>
      Object.fromEntries(order.lines.map((l) => [l.id, Math.min(l.ordered, l.available)])),
    ),
    [reason, setReason] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [accepted, setAccepted] = useState(false),
    shortfall = order.lines.some((l) => l.available < l.ordered),
    creditBlocked = order.credit.status ? ["BLOCK", "HOLD", "OVERRIDE_REQUIRED"].includes(order.credit.status) : false;

  const decide = async (decision: "ACCEPT" | "PARTIAL_ACCEPT" | "REJECT") => {
    if (decision === "REJECT" && !reason.trim()) {
      setError(hi ? "अस्वीकार करने का कारण आवश्यक है" : "A reason is required to reject this order");
      return;
    }
    setBusy(true);
    setError("");
    try {
      await post("ss-decide", {
        superStockistId: order.superStockistId,
        orderId: order.id,
        decision,
        lines: decision === "REJECT" ? [] : order.lines.map((l) => ({ lineId: l.id, quantity: decision === "ACCEPT" ? l.ordered : (qty[l.id] ?? 0) })),
        reason: reason.trim() || undefined,
        idempotencyKey: key(),
      });
      if (decision === "REJECT") router.refresh();
      else setAccepted(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Action failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <article className={styles.orderCard}>
      <header>
        <div>
          <strong>{order.distributor}</strong>
          <small>{order.territory ? `${order.territory} · ` : ""}{order.placedAt}</small>
        </div>
        <span className={styles.badge}>{order.cashOrCredit}</span>
      </header>
      <p className={styles.cardTotal} data-tone={creditBlocked ? "warn" : undefined}>
        {hi ? "क्रेडिट" : "Credit"}: {hi ? "सीमा" : "Limit"} ₹{order.credit.limit.toLocaleString("en-IN")} · {hi ? "उपयोग" : "Used"} ₹{order.credit.used.toLocaleString("en-IN")} ·{" "}
        {hi ? "उपलब्ध" : "Available"} {order.credit.available == null ? "—" : `₹${order.credit.available.toLocaleString("en-IN")}`}
        {order.credit.overdue > 0 && ` · ${hi ? "अतिदेय" : "Overdue"} ₹${order.credit.overdue.toLocaleString("en-IN")}`}
        {order.credit.status && ` · ${order.credit.status}`}
      </p>
      {creditBlocked && !accepted && (
        <p className={styles.emptyHint}>
          {hi ? "यह वितरक क्रेडिट पर रुका हुआ है — स्वीकृति के लिए अधिकृत ओवरराइड आवश्यक होगा।" : "This Distributor is on a credit hold — accepting will require an authorized override."}
        </p>
      )}
      {!accepted && (
        <>
          <ul className={styles.cardLines}>
            {order.lines.map((line) => (
              <li key={line.id} data-short={line.available < line.ordered}>
                <div>
                  <span>{line.label}</span>
                  <small>
                    {hi ? "मात्रा" : "Qty"} {line.ordered} {line.unit} · ₹{line.rate.toFixed(2)} × = ₹{line.lineTotal.toFixed(2)}
                  </small>
                  {line.available < line.ordered && (
                    <small className={styles.shortHint}>
                      {hi ? `उपलब्ध ${line.available} / मंगाया ${line.ordered}` : `Available ${line.available} / Ordered ${line.ordered}`}
                    </small>
                  )}
                </div>
                <input
                  type="number"
                  min={0}
                  max={Math.min(line.ordered, line.available)}
                  step="1"
                  value={qty[line.id] ?? 0}
                  onChange={(e) => setQty((c) => ({ ...c, [line.id]: Math.max(0, Math.min(Number(e.target.value), line.ordered, line.available)) }))}
                  aria-label={hi ? "स्वीकार मात्रा" : "Accept quantity"}
                />
              </li>
            ))}
          </ul>
          <p className={styles.cardTotal}>{hi ? "कुल ऑर्डर" : "Order total"}: ₹{order.orderTotal.toFixed(2)}</p>
          {shortfall && (
            <p className={styles.emptyHint}>
              {hi ? "कुछ उत्पादों का स्टॉक कम है — पूर्ण स्वीकार उपलब्ध नहीं है, कृपया आंशिक का उपयोग करें।" : "Some products are short on stock — full ACCEPT isn't available, use PARTIAL for the quantity on hand."}
            </p>
          )}
          <div className={styles.cardActions}>
            {!shortfall && (
              <button type="button" disabled={busy} onClick={() => void decide("ACCEPT")} className={styles.primaryBig}>
                {hi ? "स्वीकार करें" : "ACCEPT"}
              </button>
            )}
            <button type="button" disabled={busy} onClick={() => void decide("PARTIAL_ACCEPT")} className={shortfall ? styles.primaryBig : styles.secondaryBig}>
              {hi ? "आंशिक" : "PARTIAL"}
            </button>
            <button type="button" disabled={busy} onClick={() => void decide("REJECT")} className={styles.dangerBig}>
              {hi ? "अस्वीकार" : "REJECT"}
            </button>
          </div>
          <label className={styles.reasonField}>
            {hi ? "कारण (अस्वीकार / ओवरराइड के लिए आवश्यक)" : "Reason (required to reject / override)"}
            <input value={reason} onChange={(e) => setReason(e.target.value)} />
          </label>
        </>
      )}
      {accepted && (
        <p className={styles.cardTotal} data-tone="ok">
          {hi ? "ऑर्डर स्वीकृत — स्टॉक आरक्षित।" : "ORDER ACCEPTED — stock reserved."}{" "}
          <Link href={dispatchHref} className={styles.badge}>
            {hi ? "अगला: डिस्पैच तैयार करें →" : "Next: PREPARE DISPATCH →"}
          </Link>
        </p>
      )}
      {error && <p role="status" className={styles.cardError}>{error}</p>}
    </article>
  );
}

export function SuperStockistOrderCards({ language, pending, dispatchHref }: { language: "EN" | "HI"; pending: SsPendingOrder[]; dispatchHref: string }) {
  const hi = language === "HI";
  return (
    <div className={styles.cardStack}>
      <section>
        <h2>{hi ? "वितरक ऑर्डर" : "Distributor orders"}</h2>
        {pending.length ? (
          pending.map((order) => <DecisionCard key={order.id} order={order} language={language} dispatchHref={dispatchHref} />)
        ) : (
          <p className={styles.emptyHint}>{hi ? "कोई वितरक ऑर्डर लंबित नहीं है।" : "No Distributor orders are waiting."}</p>
        )}
      </section>
    </div>
  );
}
