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

export type PendingLine = { id: string; label: string; unit: string; ordered: number; available: number; rate: number; lineTotal: number };
export type PendingOrder = { id: string; distributorId: string; orderNumber: string; retailer: string; placedAt: string; salesExecutive?: string | null; cashOrCredit: string; orderTotal: number; lines: PendingLine[] };
export type DeliverableLine = { id: string; label: string; remaining: number };
export type DeliverableOrder = { deliveryId: string; orderNumber: string; retailer: string; lines: DeliverableLine[] };
export type RemainingLine = { id: string; label: string; remaining: number };
export type RemainingOrder = { id: string; distributorId: string; orderNumber: string; retailer: string; lines: RemainingLine[] };

const OUTCOMES: { value: string; en: string; hi: string }[] = [
  { value: "DELIVERED", en: "Delivered", hi: "वितरित" },
  { value: "PARTIALLY_DELIVERED", en: "Partially delivered", hi: "आंशिक वितरित" },
  { value: "DELIVER_LATER", en: "Deliver later", hi: "बाद में वितरित करें" },
  { value: "NOT_DELIVERED", en: "Not delivered", hi: "वितरित नहीं हुआ" },
  { value: "REFUSED", en: "Refused", hi: "दुकानदार ने मना किया" },
  { value: "UNABLE_TO_DELIVER", en: "Unable to deliver", hi: "वितरण संभव नहीं" },
];

function DecisionCard({ order, language }: { order: PendingOrder; language: "EN" | "HI" }) {
  const hi = language === "HI",
    router = useRouter(),
    [qty, setQty] = useState<Record<string, number>>(() =>
      Object.fromEntries(order.lines.map((l) => [l.id, Math.min(l.ordered, l.available)])),
    ),
    [reason, setReason] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    shortfall = order.lines.some((l) => l.available < l.ordered);

  const decide = async (decision: "ACCEPT" | "PARTIAL_ACCEPT" | "REJECT") => {
    if (decision === "REJECT" && !reason.trim()) {
      setError(hi ? "अस्वीकार करने का कारण आवश्यक है" : "A reason is required to reject this order");
      return;
    }
    setBusy(true);
    setError("");
    try {
      await post("easy-decide", {
        distributorId: order.distributorId,
        orderId: order.id,
        decision,
        lines:
          decision === "REJECT"
            ? []
            : order.lines.map((l) => ({ lineId: l.id, quantity: decision === "ACCEPT" ? l.ordered : (qty[l.id] ?? 0) })),
        reason: reason.trim() || undefined,
        idempotencyKey: key(),
      });
      router.refresh();
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
          <strong>{order.retailer}</strong>
          <small>{order.placedAt}{order.salesExecutive ? ` · ${order.salesExecutive}` : ""}</small>
        </div>
        <span className={styles.badge}>{order.cashOrCredit}</span>
      </header>
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
          {hi
            ? "कुछ उत्पादों का स्टॉक कम है — पूर्ण स्वीकार उपलब्ध नहीं है, कृपया आंशिक (उपलब्ध मात्रा) का उपयोग करें।"
            : "Some products are short on stock — full ACCEPT isn't available, use PARTIAL for the quantity on hand."}
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
        {hi ? "कारण (अस्वीकार के लिए आवश्यक)" : "Reason (required to reject)"}
        <input value={reason} onChange={(e) => setReason(e.target.value)} />
      </label>
      {error && <p role="status" className={styles.cardError}>{error}</p>}
    </article>
  );
}

function DeliveryCard({ order, language }: { order: DeliverableOrder; language: "EN" | "HI" }) {
  const hi = language === "HI",
    router = useRouter(),
    [qty, setQty] = useState<Record<string, number>>(() => Object.fromEntries(order.lines.map((l) => [l.id, l.remaining]))),
    [reason, setReason] = useState(""),
    [receiverName, setReceiverName] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");

  const outcome = async (value: string) => {
    setBusy(true);
    setError("");
    try {
      await post("easy-delivery-outcome", {
        deliveryId: order.deliveryId,
        outcome: value,
        lines: order.lines.map((l) => ({
          lineId: l.id,
          quantity: value === "DELIVERED" ? l.remaining : value === "PARTIALLY_DELIVERED" ? (qty[l.id] ?? 0) : 0,
        })),
        reason: reason.trim() || undefined,
        receiverName: receiverName.trim() || undefined,
      });
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Action failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <article className={styles.orderCard} data-stage="delivery">
      <header>
        <div>
          <strong>{order.retailer}</strong>
          <small>{hi ? "वितरण हेतु तैयार" : "Ready for delivery"}</small>
        </div>
        <span className={styles.badge}>{hi ? "डिलीवरी" : "DELIVER"}</span>
      </header>
      <ul className={styles.cardLines}>
        {order.lines.map((line) => (
          <li key={line.id}>
            <div>
              <span>{line.label}</span>
              <small>{hi ? "शेष" : "Remaining"}: {line.remaining}</small>
            </div>
            <input
              type="number"
              min={0}
              max={line.remaining}
              step="1"
              value={qty[line.id] ?? 0}
              onChange={(e) => setQty((c) => ({ ...c, [line.id]: Math.max(0, Math.min(Number(e.target.value), line.remaining)) }))}
              aria-label={hi ? "वितरित मात्रा" : "Delivered quantity"}
            />
          </li>
        ))}
      </ul>
      <label>
        {hi ? "प्राप्तकर्ता का नाम (वैकल्पिक)" : "Receiver name (optional)"}
        <input value={receiverName} onChange={(e) => setReceiverName(e.target.value)} />
      </label>
      <label className={styles.reasonField}>
        {hi ? "कारण / टिप्पणी" : "Reason / note"}
        <input value={reason} onChange={(e) => setReason(e.target.value)} />
      </label>
      <div className={styles.cardActions}>
        {OUTCOMES.map((o) => (
          <button key={o.value} type="button" disabled={busy} onClick={() => void outcome(o.value)} className={styles.secondaryBig}>
            {hi ? o.hi : o.en}
          </button>
        ))}
      </div>
      {error && <p role="status" className={styles.cardError}>{error}</p>}
    </article>
  );
}

function RemainingCard({ order, language }: { order: RemainingOrder; language: "EN" | "HI" }) {
  const hi = language === "HI",
    router = useRouter(),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [closeReason, setCloseReason] = useState("");

  const deliverRemaining = async () => {
    setBusy(true);
    setError("");
    try {
      await post("easy-deliver-remaining", {
        distributorId: order.distributorId,
        orderId: order.id,
        lines: order.lines.map((l) => ({ lineId: l.id, quantity: l.remaining })),
        idempotencyKey: key(),
      });
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Action failed");
    } finally {
      setBusy(false);
    }
  };
  const closeRemaining = async () => {
    if (!closeReason.trim()) {
      setError(hi ? "बंद करने का कारण आवश्यक है" : "A reason is required to close the remaining balance");
      return;
    }
    setBusy(true);
    setError("");
    try {
      await post("close-remaining", { partyType: "DISTRIBUTOR", partyId: order.distributorId, orderId: order.id, reason: closeReason.trim() });
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Action failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <article className={styles.orderCard} data-stage="remaining">
      <header>
        <div>
          <strong>{order.retailer}</strong>
          <small>{hi ? "आंशिक ऑर्डर का शेष भाग" : "Remaining balance of a partial order"}</small>
        </div>
      </header>
      <ul className={styles.cardLines}>
        {order.lines.map((line) => (
          <li key={line.id}>
            <div>
              <span>{line.label}</span>
              <small>{hi ? "शेष" : "Remaining"}: {line.remaining}</small>
            </div>
          </li>
        ))}
      </ul>
      <div className={styles.cardActions}>
        <button type="button" disabled={busy} onClick={() => void deliverRemaining()} className={styles.primaryBig}>
          {hi ? "अभी शेष भेजें" : "DELIVER REMAINING NOW"}
        </button>
      </div>
      <label className={styles.reasonField}>
        {hi ? "शेष बंद करने का कारण" : "Reason to close the remaining balance"}
        <input value={closeReason} onChange={(e) => setCloseReason(e.target.value)} />
      </label>
      <div className={styles.cardActions}>
        <button type="button" disabled={busy} onClick={() => void closeRemaining()} className={styles.dangerBig}>
          {hi ? "शेष बंद करें" : "CLOSE / REJECT REMAINING"}
        </button>
      </div>
      {error && <p role="status" className={styles.cardError}>{error}</p>}
    </article>
  );
}

export function DistributorOrderCards({
  language,
  pending,
  awaitingDelivery,
  remaining,
}: {
  language: "EN" | "HI";
  pending: PendingOrder[];
  awaitingDelivery: DeliverableOrder[];
  remaining: RemainingOrder[];
}) {
  const hi = language === "HI";
  return (
    <div className={styles.cardStack}>
      <section>
        <h2>{hi ? "नए ऑर्डर" : "New orders"}</h2>
        {pending.length ? (
          pending.map((order) => <DecisionCard key={order.id} order={order} language={language} />)
        ) : (
          <p className={styles.emptyHint}>{hi ? "कोई नया ऑर्डर लंबित नहीं है।" : "No new orders are waiting."}</p>
        )}
      </section>
      {awaitingDelivery.length > 0 && (
        <section>
          <h2>{hi ? "डिलीवरी हेतु तैयार" : "Ready to deliver"}</h2>
          {awaitingDelivery.map((order) => (
            <DeliveryCard key={order.deliveryId} order={order} language={language} />
          ))}
        </section>
      )}
      {remaining.length > 0 && (
        <section>
          <h2>{hi ? "शेष मात्रा" : "Remaining balance"}</h2>
          {remaining.map((order) => (
            <RemainingCard key={order.id} order={order} language={language} />
          ))}
        </section>
      )}
    </div>
  );
}
