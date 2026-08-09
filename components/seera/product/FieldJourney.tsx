"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import styles from "./FieldJourney.module.css";
type Retailer = { id: string; label: string; detail: string };
type Sku = { id: string; label: string; price: string };
async function send(action: string, payload: Record<string, unknown>) {
  const response = await fetch("/api/field/operations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, payload }),
    }),
    data = await response.json().catch(() => ({}));
  if (!response.ok)
    throw new Error(
      data?.error?.message ?? data?.error?.code ?? "Action failed",
    );
  return data;
}
const key = () => crypto.randomUUID();
export function FieldJourney({
  language,
  session,
  visit,
  retailers,
  skus,
}: {
  language: "EN" | "HI";
  session?: { id: string; startedAt: string };
  visit?: { id: string; retailerId: string; retailerName: string };
  retailers: Retailer[];
  skus: Sku[];
}) {
  const hi = language === "HI",
    router = useRouter(),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState<{ ok: boolean; text: string } | null>(
      null,
    ),
    [mode, setMode] = useState<"ORDER" | "COLLECTION" | "NOTE">("ORDER");
  const run = async (action: string, payload: Record<string, unknown>) => {
    setBusy(true);
    setMessage(null);
    try {
      await send(action, payload);
      setMessage({
        ok: true,
        text: hi
          ? "कार्रवाई सुरक्षित रूप से सहेजी गई।"
          : "Action saved securely.",
      });
      router.refresh();
    } catch (error) {
      setMessage({
        ok: false,
        text: error instanceof Error ? error.message : "Action failed",
      });
    } finally {
      setBusy(false);
    }
  };
  if (!session)
    return (
      <section className={styles.journey}>
        <header>
          <span>1</span>
          <div>
            <small>{hi ? "फील्ड दिवस" : "FIELD DAY"}</small>
            <h2>{hi ? "आज का काम शुरू करें" : "Start today’s work"}</h2>
            <p>
              {hi
                ? "स्थान अनुमति स्थिति की पुष्टि करें और आज की बीट शुरू करें।"
                : "Confirm location permission status and begin today’s beat."}
            </p>
          </div>
        </header>
        <button
          className={styles.primary}
          disabled={busy}
          onClick={() =>
            run("start-day", {
              workingType: "RETAILING",
              remarks: "Started from field portal",
            })
          }
        >
          {hi ? "दिन शुरू करें" : "Start day"}
        </button>
        {message && (
          <p role="status" data-ok={message.ok}>
            {message.text}
          </p>
        )}
      </section>
    );
  if (!visit)
    return (
      <section className={styles.journey}>
        <header>
          <span>2</span>
          <div>
            <small>{hi ? "आज की बीट" : "TODAY’S BEAT"}</small>
            <h2>
              {hi ? "अगला खुदरा विक्रेता चुनें" : "Choose the next retailer"}
            </h2>
            <p>
              {hi
                ? `दिन ${new Date(session.startedAt).toLocaleTimeString("hi-IN", { hour: "2-digit", minute: "2-digit" })} पर शुरू हुआ।`
                : `Day started at ${new Date(session.startedAt).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}.`}
            </p>
          </div>
        </header>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            void run("check-in", {
              workSessionId: session.id,
              retailerId: String(f.get("retailerId")),
              idempotencyKey: key(),
            });
          }}
        >
          <label>
            {hi ? "खुदरा विक्रेता खोजें / चुनें" : "Search / select retailer"}
            <select name="retailerId" required>
              <option value="">
                {hi ? "व्यवसाय नाम से चुनें" : "Choose by business name"}
              </option>
              {retailers.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.label} · {r.detail}
                </option>
              ))}
            </select>
          </label>
          <button
            className={styles.primary}
            disabled={busy || !retailers.length}
          >
            {hi ? "चेक-इन करें" : "Check in"}
          </button>
        </form>
        <button
          className={styles.secondary}
          disabled={busy}
          onClick={() =>
            run("end-day", {
              sessionId: session.id,
              outcome: "COMPLETED",
              remarks: "Completed from field portal",
            })
          }
        >
          {hi ? "दिन समाप्त करें" : "End day"}
        </button>
        {message && (
          <p role="status" data-ok={message.ok}>
            {message.text}
          </p>
        )}
      </section>
    );
  return (
    <section className={styles.journey}>
      <header>
        <span>3</span>
        <div>
          <small>{hi ? "सक्रिय विज़िट" : "ACTIVE VISIT"}</small>
          <h2>{visit.retailerName}</h2>
          <p>
            {hi
              ? "ऑर्डर, संग्रह या नोट दर्ज करें; फिर चेकआउट करें।"
              : "Record an order, collection or note, then check out."}
          </p>
        </div>
      </header>
      <div className={styles.tabs}>
        {(["ORDER", "COLLECTION", "NOTE"] as const).map((x) => (
          <button key={x} data-active={mode === x} onClick={() => setMode(x)}>
            {x}
          </button>
        ))}
      </div>
      {mode === "ORDER" && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            void run("place-order", {
              retailerId: visit.retailerId,
              idempotencyKey: key(),
              notes: String(f.get("notes") ?? ""),
              lines: [
                {
                  skuId: String(f.get("skuId")),
                  quantity: Number(f.get("quantity")),
                },
              ],
            });
          }}
        >
          <label>
            {hi ? "उत्पाद / SKU" : "Product / SKU"}
            <select name="skuId" required>
              <option value="">{hi ? "उत्पाद चुनें" : "Choose product"}</option>
              {skus.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.label} · {s.price}
                </option>
              ))}
            </select>
          </label>
          <label>
            {hi ? "मात्रा" : "Quantity"}
            <input name="quantity" type="number" min="1" step="1" required />
          </label>
          <label>
            {hi ? "ऑर्डर टिप्पणी" : "Order note"}
            <input name="notes" />
          </label>
          <button className={styles.primary} disabled={busy || !skus.length}>
            {hi ? "ऑर्डर सहेजें" : "Save order"}
          </button>
        </form>
      )}
      {mode === "COLLECTION" && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            void run("collection", {
              retailerId: visit.retailerId,
              amount: Number(f.get("amount")),
              paymentMode: String(f.get("paymentMode")),
              reference: String(f.get("reference") ?? "") || undefined,
              remarks: String(f.get("remarks") ?? ""),
              idempotencyKey: key(),
            });
          }}
        >
          <label>
            {hi ? "राशि" : "Amount"}
            <input
              name="amount"
              type="number"
              min="0.01"
              step="0.01"
              required
            />
          </label>
          <label>
            {hi ? "भुगतान प्रकार" : "Payment mode"}
            <select name="paymentMode">
              <option>UPI</option>
              <option>CASH</option>
              <option>BANK_TRANSFER</option>
              <option>CHEQUE</option>
            </select>
          </label>
          <label>
            {hi ? "संदर्भ" : "Reference"}
            <input name="reference" />
          </label>
          <label>
            {hi ? "टिप्पणी" : "Remarks"}
            <input name="remarks" />
          </label>
          <button className={styles.primary} disabled={busy}>
            {hi ? "संग्रह सहेजें" : "Save collection"}
          </button>
        </form>
      )}
      {mode === "NOTE" && (
        <p className={styles.note}>
          {hi
            ? "चेकआउट के समय फॉलो-अप या नो-ऑर्डर टिप्पणी दर्ज करें।"
            : "Add follow-up or no-order notes during checkout."}
        </p>
      )}
      <form
        className={styles.checkout}
        onSubmit={(e) => {
          e.preventDefault();
          const f = new FormData(e.currentTarget);
          void run("check-out", {
            visitId: visit.id,
            outcome: String(f.get("outcome")),
            noOrderReason: String(f.get("noOrderReason") ?? "") || undefined,
            notes: String(f.get("notes") ?? ""),
          });
        }}
      >
        <label>
          {hi ? "विज़िट परिणाम" : "Visit outcome"}
          <select name="outcome">
            <option value="ORDER_BOOKED">ORDER BOOKED</option>
            <option value="COLLECTION">COLLECTION</option>
            <option value="FOLLOW_UP">FOLLOW UP</option>
            <option value="NO_ORDER">NO ORDER</option>
            <option value="MARKET_INTELLIGENCE">MARKET INTELLIGENCE</option>
          </select>
        </label>
        <label>
          {hi ? "कारण / फॉलो-अप" : "Reason / follow-up"}
          <input name="noOrderReason" />
        </label>
        <label>
          {hi ? "विज़िट टिप्पणी" : "Visit note"}
          <input name="notes" />
        </label>
        <button className={styles.secondary} disabled={busy}>
          {hi ? "चेकआउट और अगला" : "Checkout & next"}
        </button>
      </form>
      {message && (
        <p role="status" data-ok={message.ok}>
          {message.text}
        </p>
      )}
    </section>
  );
}
