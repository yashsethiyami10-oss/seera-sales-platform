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

export type ConfirmedCompanyOrder = { id: string; orderNumber: string; superStockist: string; total: number; verifiedAt: string | null };

function DispatchCard({ order, language }: { order: ConfirmedCompanyOrder; language: "EN" | "HI" }) {
  const hi = language === "HI",
    router = useRouter(),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");

  return (
    <article className={styles.orderCard}>
      <header>
        <div>
          <strong>{order.superStockist}</strong>
          <small>{order.orderNumber} · ₹{order.total.toFixed(2)}</small>
        </div>
        <span className={styles.badge}>{hi ? "भुगतान सत्यापित" : "PAYMENT VERIFIED"}</span>
      </header>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          const f = new FormData(e.currentTarget);
          setBusy(true);
          setError("");
          void post("dispatch-company-order", {
            orderId: order.id,
            idempotencyKey: key(),
            vehicleNumber: String(f.get("vehicleNumber") || "") || undefined,
            driverName: String(f.get("driverName") || "") || undefined,
            driverMobile: String(f.get("driverMobile") || "") || undefined,
            transporterName: String(f.get("transporterName") || "") || undefined,
            lrNumber: String(f.get("lrNumber") || "") || undefined,
            challanNumber: String(f.get("challanNumber") || "") || undefined,
            eta: String(f.get("eta") || "") || undefined,
          })
            .then(() => router.refresh())
            .catch((err) => setError(err instanceof Error ? err.message : "Action failed"))
            .finally(() => setBusy(false));
        }}
      >
        <div className={styles.cardLines}>
          <li>
            <input name="vehicleNumber" placeholder={hi ? "वाहन नंबर" : "Vehicle number"} />
          </li>
          <li>
            <input name="driverName" placeholder={hi ? "चालक का नाम" : "Driver name"} />
          </li>
          <li>
            <input name="driverMobile" type="tel" placeholder={hi ? "चालक मोबाइल" : "Driver mobile"} />
          </li>
          <li>
            <input name="transporterName" placeholder={hi ? "ट्रांसपोर्टर" : "Transporter"} />
          </li>
          <li>
            <input name="lrNumber" placeholder={hi ? "LR नंबर" : "LR number"} />
          </li>
          <li>
            <input name="challanNumber" placeholder={hi ? "चालान नंबर" : "Challan number"} />
          </li>
          <li>
            <input name="eta" type="datetime-local" />
          </li>
        </div>
        <div className={styles.cardActions}>
          <button disabled={busy} className={styles.primaryBig}>
            {hi ? "डिस्पैच बनाएँ" : "CREATE DISPATCH"}
          </button>
        </div>
      </form>
      {error && <p role="status" className={styles.cardError}>{error}</p>}
    </article>
  );
}

export function CompanyOrderDispatchPanel({ language, orders }: { language: "EN" | "HI"; orders: ConfirmedCompanyOrder[] }) {
  const hi = language === "HI";
  return (
    <div className={styles.cardStack}>
      <section>
        <h2>{hi ? "कंपनी ऑर्डर डिस्पैच" : "Company order dispatch"}</h2>
        {orders.length ? (
          orders.map((order) => <DispatchCard key={order.id} order={order} language={language} />)
        ) : (
          <p className={styles.emptyHint}>{hi ? "कोई भुगतान-सत्यापित कंपनी ऑर्डर डिस्पैच के लिए लंबित नहीं है।" : "No payment-verified Company order is waiting for dispatch."}</p>
        )}
      </section>
    </div>
  );
}
