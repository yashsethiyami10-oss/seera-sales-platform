"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import styles from "./WorkflowActions.module.css";
type Option = { value: string; label: string; meta?: string };
type Order = {
  id: string;
  label: string;
  partnerId: string;
  total?: number;
  lines: { id: string; label: string; ordered: number }[];
};
const key = () => crypto.randomUUID();
async function post(action: string, payload: unknown) {
  const r = await fetch("/api/distribution/operations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, payload }),
    }),
    d = await r.json().catch(() => ({}));
  if (!r.ok)
    throw new Error(d?.error?.message ?? d?.error?.code ?? "Action failed");
  return d;
}
export function DistributionActions({
  kind,
  language,
  partyType,
  parties,
  skus = [],
  orders = [],
}: {
  kind:
    | "fulfil"
    | "fulfil-stockist"
    | "replenishment"
    | "movement"
    | "reconcile"
    | "company-order";
  language: "EN" | "HI";
  partyType: "DISTRIBUTOR" | "SUPER_STOCKIST";
  parties: Option[];
  skus?: Option[];
  orders?: Order[];
}) {
  const hi = language === "HI",
    router = useRouter(),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState(""),
    [orderId, setOrderId] = useState(""),
    chosen = orders.find((x) => x.id === orderId);
  const run = async (action: string, payload: unknown) => {
    setBusy(true);
    setMessage("");
    try {
      await post(action, payload);
      setMessage(
        hi
          ? "कार्रवाई सफलतापूर्वक पूरी हुई।"
          : "Action completed successfully.",
      );
      router.refresh();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Action failed");
    } finally {
      setBusy(false);
    }
  };
  if (kind === "fulfil" || kind === "fulfil-stockist")
    return (
      <section className={styles.panel}>
        <div>
          <small>{hi ? "ऑर्डर इनबॉक्स" : "ORDER INBOX"}</small>
          <h2>
            {hi ? "खुदरा ऑर्डर स्वीकार करें" : "Acknowledge retailer order"}
          </h2>
        </div>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            if (!chosen) return;
            void run(
              kind === "fulfil"
                ? "fulfil-order"
                : "fulfil-distributor-replenishment",
              {
                ...(kind === "fulfil"
                  ? { distributorId: chosen.partnerId }
                  : { superStockistId: chosen.partnerId }),
                orderId: chosen.id,
                decision: String(f.get("decision")),
                reason: String(f.get("reason") ?? ""),
                accepted: chosen.lines.map((line) => ({
                  lineId: line.id,
                  quantity:
                    String(f.get(`line-${line.id}`)) === ""
                      ? line.ordered
                      : Number(f.get(`line-${line.id}`)),
                })),
              },
            );
          }}
        >
          <label>
            {hi ? "ऑर्डर चुनें" : "Select order"}
            <select
              value={orderId}
              onChange={(e) => setOrderId(e.target.value)}
              required
            >
              <option value="">
                {hi ? "ऑर्डर नंबर से चुनें" : "Choose by order number"}
              </option>
              {orders.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>
          <label>
            {hi ? "निर्णय" : "Decision"}
            <select name="decision">
              <option value="ACCEPT">ACCEPT</option>
              <option value="PARTIAL_ACCEPT">PARTIAL ACCEPT</option>
              <option value="HOLD">HOLD</option>
              <option value="REJECT">REJECT</option>
            </select>
          </label>
          {chosen?.lines.map((line) => (
            <label key={line.id}>
              {line.label}
              <input
                name={`line-${line.id}`}
                type="number"
                min="0"
                max={line.ordered}
                step="1"
                defaultValue={line.ordered}
              />
            </label>
          ))}
          <label>
            {hi ? "कारण / टिप्पणी" : "Reason / note"}
            <input name="reason" />
          </label>
          <button disabled={busy || !chosen}>
            {hi ? "निर्णय सहेजें" : "Save decision"}
          </button>
        </form>
        {message && <p role="status">{message}</p>}
      </section>
    );
  if (kind === "replenishment")
    return (
      <section className={styles.panel}>
        <div>
          <small>{hi ? "वितरक पुनःपूर्ति" : "DISTRIBUTOR REPLENISHMENT"}</small>
          <h2>
            {hi
              ? "सुपर स्टॉकिस्ट को ऑर्डर भेजें"
              : "Send order to assigned Super Stockist"}
          </h2>
        </div>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            const form = new FormData(event.currentTarget);
            void run("create-distributor-replenishment", {
              distributorId: String(form.get("partyId")),
              idempotencyKey: key(),
              notes: String(form.get("notes") || "") || undefined,
              lines: [
                {
                  skuId: String(form.get("skuId")),
                  quantity: Number(form.get("quantity")),
                },
              ],
            });
          }}
        >
          <label>
            {hi ? "वितरक" : "Distributor"}
            <select name="partyId" required>
              {parties.map((party) => (
                <option key={party.value} value={party.value}>
                  {party.label}
                </option>
              ))}
            </select>
          </label>
          <label>
            {hi ? "उत्पाद / SKU" : "Product / SKU"}
            <select name="skuId" required>
              {skus.map((sku) => (
                <option key={sku.value} value={sku.value}>
                  {sku.label}
                </option>
              ))}
            </select>
          </label>
          <label>
            {hi ? "मात्रा" : "Quantity"}
            <input name="quantity" type="number" min="1" step="1" required />
          </label>
          <label>
            {hi ? "टिप्पणी" : "Order note"}
            <input name="notes" />
          </label>
          <button disabled={busy || !parties.length || !skus.length}>
            {hi ? "ऑर्डर भेजें" : "Submit order"}
          </button>
        </form>
        {message && <p role="status">{message}</p>}
      </section>
    );
  if (kind === "company-order")
    return (
      <section className={styles.panel}>
        <div>
          <small>{hi ? "अग्रिम भुगतान केवल" : "ADVANCE PAYMENT ONLY"}</small>
          <h2>
            {hi ? "कंपनी पुनःपूर्ति ऑर्डर" : "Company replenishment order"}
          </h2>
        </div>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            void run("company-order", {
              superStockistId: String(f.get("partyId")),
              subtotal: Number(f.get("subtotal")),
              idempotencyKey: key(),
            });
          }}
        >
          <label>
            {hi ? "सुपर स्टॉकिस्ट" : "Super Stockist"}
            <select name="partyId" required>
              {parties.map((p) => (
                <option key={p.value} value={p.value}>
                  {p.label}
                </option>
              ))}
            </select>
          </label>
          <label>
            {hi ? "ऑर्डर मूल्य" : "Order value"}
            <input
              name="subtotal"
              type="number"
              min="0.01"
              step="0.01"
              required
            />
          </label>
          <button disabled={busy || !parties.length}>
            {hi ? "भुगतान-लंबित ऑर्डर बनाएँ" : "Create payment-pending order"}
          </button>
        </form>
        <form onSubmit={(e)=>{e.preventDefault();const f=new FormData(e.currentTarget),order=orders.find((x)=>x.id===String(f.get("orderId")));if(!order)return;void run("submit-payment-proof",{superStockistId:order.partnerId,orderId:order.id,amount:Number(f.get("amount")),reference:String(f.get("reference")),fileId:String(f.get("fileId")||"")||undefined,idempotencyKey:key()});}}>
          <h3>{hi ? "अग्रिम भुगतान प्रमाण जमा करें" : "Submit advance payment proof"}</h3>
          <label>{hi ? "भुगतान-लंबित ऑर्डर" : "Payment-pending order"}<select name="orderId" required><option value="">{hi ? "ऑर्डर नंबर चुनें" : "Choose order number"}</option>{orders.map((o)=><option key={o.id} value={o.id}>{o.label}</option>)}</select></label>
          <label>{hi ? "राशि" : "Amount"}<input name="amount" type="number" min="0.01" step="0.01" required /></label>
          <label>{hi ? "बैंक / UTR संदर्भ" : "Bank / UTR reference"}<input name="reference" minLength={3} required /></label>
          <label>{hi ? "अपलोड की गई फ़ाइल (वैकल्पिक)" : "Uploaded file (optional)"}<input name="fileId" /></label>
          <button disabled={busy||!orders.length}>{hi ? "समीक्षा हेतु जमा करें" : "Submit for Accounts review"}</button>
        </form>
        {message && <p role="status">{message}</p>}
      </section>
    );
  const reconcile = kind === "reconcile";
  return (
    <section className={styles.panel}>
      <div>
        <small>
          {reconcile
            ? hi
              ? "भौतिक स्टॉक"
              : "PHYSICAL STOCK"
            : hi
              ? "स्टॉक गतिविधि"
              : "STOCK MOVEMENT"}
        </small>
        <h2>
          {reconcile
            ? hi
              ? "स्टॉक मिलान"
              : "Stock reconciliation"
            : hi
              ? "नियंत्रित स्टॉक गतिविधि"
              : "Governed stock movement"}
        </h2>
      </div>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          const f = new FormData(e.currentTarget),
            partyId = String(f.get("partyId")),
            skuId = String(f.get("skuId")),
            reason = String(f.get("reason"));
          void run(
            reconcile ? "reconcile-stock" : "inventory-movement",
            reconcile
              ? {
                  partyType,
                  partyId,
                  periodEnd: String(f.get("periodEnd")),
                  sourcePortal:
                    partyType === "DISTRIBUTOR"
                      ? "distributor"
                      : "super-stockist",
                  reason,
                  idempotencyKey: key(),
                  lines: [
                    {
                      skuId,
                      opening: Number(f.get("opening")),
                      receipts: Number(f.get("receipts")),
                      issues: Number(f.get("issues")),
                      physicalClosing: Number(f.get("physicalClosing")),
                      reason,
                    },
                  ],
                }
              : {
                  partyType,
                  partyId,
                  skuId,
                  type: String(f.get("type")),
                  direction: String(f.get("direction")),
                  quantity: Number(f.get("quantity")),
                  sourceType: "PORTAL_ADJUSTMENT",
                  sourceId: key(),
                  sourcePortal:
                    partyType === "DISTRIBUTOR"
                      ? "distributor"
                      : "super-stockist",
                  reason,
                  idempotencyKey: key(),
                },
          );
        }}
      >
        <label>
          {hi ? "व्यावसायिक इकाई" : "Business party"}
          <select name="partyId" required>
            {parties.map((p) => (
              <option key={p.value} value={p.value}>
                {p.label}
              </option>
            ))}
          </select>
        </label>
        <label>
          {hi ? "उत्पाद / SKU" : "Product / SKU"}
          <select name="skuId" required>
            {skus.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
        </label>
        {reconcile ? (
          <>
            <label>
              {hi ? "अवधि समाप्ति" : "Period end"}
              <input name="periodEnd" type="date" required />
            </label>
            {["opening", "receipts", "issues", "physicalClosing"].map((x) => (
              <label key={x}>
                {x}
                <input name={x} type="number" min="0" step="0.001" required />
              </label>
            ))}
          </>
        ) : (
          <>
            <label>
              {hi ? "गतिविधि" : "Movement"}
              <select name="type">
                <option>RECEIPT</option>
                <option>RETURN</option>
                <option>DAMAGE</option>
                <option>SHORTAGE</option>
                <option>ADJUSTMENT</option>
                <option>CORRECTION</option>
              </select>
            </label>
            <label>
              {hi ? "दिशा" : "Direction"}
              <select name="direction">
                <option>IN</option>
                <option>OUT</option>
                <option>RESERVE</option>
                <option>RELEASE</option>
              </select>
            </label>
            <label>
              {hi ? "मात्रा" : "Quantity"}
              <input
                name="quantity"
                type="number"
                min="0.001"
                step="0.001"
                required
              />
            </label>
          </>
        )}
        <label>
          {hi ? "कारण" : "Reason"}
          <input name="reason" minLength={3} required />
        </label>
        <button disabled={busy || !parties.length || !skus.length}>
          {hi ? "सहेजें" : "Save"}
        </button>
      </form>
      {message && <p role="status">{message}</p>}
    </section>
  );
}
