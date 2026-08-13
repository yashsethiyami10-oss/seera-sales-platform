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

export type IncomingLine = { id: string; label: string; sent: number };
export type IncomingConsignment = { id: string; from: string; orderNumber: string; dispatchedAt: string | null; partnerId: string; lines: IncomingLine[] };

function ConsignmentCard({ order, partyType, language }: { order: IncomingConsignment; partyType: "DISTRIBUTOR" | "SUPER_STOCKIST"; language: "EN" | "HI" }) {
  const hi = language === "HI",
    router = useRouter(),
    [mode, setMode] = useState<"idle" | "short">("idle"),
    [received, setReceived] = useState<Record<string, number>>(() => Object.fromEntries(order.lines.map((l) => [l.id, l.sent]))),
    [reason, setReason] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");

  const submit = async (full: boolean) => {
    if (!full && !reason.trim()) {
      setError(hi ? "कम प्राप्ति का कारण आवश्यक है" : "A reason is required for a short receipt");
      return;
    }
    setBusy(true);
    setError("");
    try {
      await post("receive-incoming", {
        partyType,
        partyId: order.partnerId,
        orderId: order.id,
        idempotencyKey: key(),
        reason: reason.trim() || undefined,
        lines: order.lines.map((l) => ({ lineId: l.id, quantity: full ? l.sent : (received[l.id] ?? 0) })),
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
          <strong>{hi ? "से" : "FROM"}: {order.from}</strong>
          <small>{order.orderNumber}{order.dispatchedAt ? ` · ${order.dispatchedAt}` : ""}</small>
        </div>
      </header>
      <ul className={styles.cardLines}>
        {order.lines.map((line) => (
          <li key={line.id}>
            <div>
              <span>{line.label}</span>
              <small>{hi ? "भेजी गई मात्रा" : "Sent"}: {line.sent}</small>
            </div>
            {mode === "short" && (
              <input
                type="number"
                min={0}
                max={line.sent}
                step="1"
                value={received[line.id] ?? 0}
                onChange={(e) => setReceived((c) => ({ ...c, [line.id]: Math.max(0, Math.min(Number(e.target.value), line.sent)) }))}
                aria-label={hi ? "प्राप्त मात्रा" : "Received quantity"}
              />
            )}
          </li>
        ))}
      </ul>
      {mode === "idle" && (
        <div className={styles.cardActions}>
          <button type="button" disabled={busy} onClick={() => void submit(true)} className={styles.primaryBig}>
            {hi ? "पूर्ण प्राप्त हुआ" : "RECEIVED FULL"}
          </button>
          <button type="button" disabled={busy} onClick={() => setMode("short")} className={styles.secondaryBig}>
            {hi ? "कम प्राप्त हुआ" : "RECEIVED SHORT"}
          </button>
        </div>
      )}
      {mode === "short" && (
        <>
          <label className={styles.reasonField}>
            {hi ? "कम प्राप्ति का कारण" : "Reason for short receipt"}
            <input value={reason} onChange={(e) => setReason(e.target.value)} />
          </label>
          <div className={styles.cardActions}>
            <button type="button" disabled={busy} onClick={() => void submit(false)} className={styles.primaryBig}>
              {hi ? "प्राप्ति दर्ज करें" : "CONFIRM SHORT RECEIPT"}
            </button>
            <button type="button" disabled={busy} onClick={() => setMode("idle")} className={styles.secondaryBig}>
              {hi ? "रद्द करें" : "Cancel"}
            </button>
          </div>
        </>
      )}
      {error && <p role="status" className={styles.cardError}>{error}</p>}
    </article>
  );
}

export function IncomingStockCards({ language, orders, partyType }: { language: "EN" | "HI"; orders: IncomingConsignment[]; partyType: "DISTRIBUTOR" | "SUPER_STOCKIST" }) {
  const hi = language === "HI";
  return (
    <div className={styles.cardStack}>
      <section>
        <h2>{hi ? "आने वाला स्टॉक" : "Incoming stock"}</h2>
        {orders.length ? (
          orders.map((order) => <ConsignmentCard key={order.id} order={order} partyType={partyType} language={language} />)
        ) : (
          <p className={styles.emptyHint}>{hi ? "कोई आने वाली खेप लंबित नहीं है।" : "No incoming consignment is waiting."}</p>
        )}
      </section>
    </div>
  );
}
