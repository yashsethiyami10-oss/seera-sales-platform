"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import styles from "./WorkflowActions.module.css";
import { SkuSelect } from "./SkuSelect";

type Option = { value: string; label: string; brand?: string };
type ReturnRequest = {
  id: string;
  requestNumber: string;
  skuLabel: string;
  quantity: number;
  condition: string;
  reason: string;
  status: string;
  creditNoteRequested: boolean;
  createdBySelf: boolean;
};
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

export function ReturnsActions({
  language,
  partyType,
  parties,
  retailers,
  skus,
  orders,
  requests,
}: {
  language: "EN" | "HI";
  partyType: "DISTRIBUTOR" | "SUPER_STOCKIST";
  parties: Option[];
  retailers: Option[];
  skus: Option[];
  orders: Option[];
  requests: ReturnRequest[];
}) {
  const hi = language === "HI",
    router = useRouter(),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState("");
  const run = async (action: string, payload: unknown) => {
    setBusy(true);
    setMessage("");
    try {
      await post(action, payload);
      setMessage(hi ? "कार्रवाई सफलतापूर्वक पूरी हुई।" : "Action completed successfully.");
      router.refresh();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Action failed");
    } finally {
      setBusy(false);
    }
  };
  return (
    <section className={styles.panel}>
      <div>
        <small>{hi ? "रिटर्न और डैमेज" : "RETURNS & DAMAGE"}</small>
        <h2>{hi ? "वापसी या क्षति दर्ज करें" : "Record a return or damage"}</h2>
      </div>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          const f = new FormData(e.currentTarget);
          void run("create-return-request", {
            partyType,
            partyId: String(f.get("partyId")),
            retailerId: String(f.get("retailerId") || "") || undefined,
            sourceOrderId: String(f.get("sourceOrderId") || "") || undefined,
            skuId: String(f.get("skuId")),
            quantity: Number(f.get("quantity")),
            condition: String(f.get("condition")),
            reason: String(f.get("reason")),
            creditNoteRequested: f.get("creditNoteRequested") === "on",
            sourcePortal: partyType === "DISTRIBUTOR" ? "distributor" : "super-stockist",
            idempotencyKey: key(),
          });
          (e.currentTarget as HTMLFormElement).reset();
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
          {hi ? "खुदरा विक्रेता (वैकल्पिक)" : "Retailer (optional)"}
          <select name="retailerId">
            <option value="">{hi ? "लागू नहीं" : "Not applicable"}</option>
            {retailers.map((r) => (
              <option key={r.value} value={r.value}>
                {r.label}
              </option>
            ))}
          </select>
        </label>
        <label>
          {hi ? "स्रोत ऑर्डर (वैकल्पिक)" : "Source order (optional)"}
          <select name="sourceOrderId">
            <option value="">{hi ? "लागू नहीं" : "Not applicable"}</option>
            {orders.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
        <label>
          {hi ? "उत्पाद / SKU" : "Product / SKU"}
          <SkuSelect name="skuId" language={language} skus={skus.map((s) => ({ ...s, brand: s.brand ?? "Seera" }))} required />
        </label>
        <label>
          {hi ? "मात्रा" : "Quantity"}
          <input name="quantity" type="number" min="0.001" step="0.001" required />
        </label>
        <label>
          {hi ? "स्थिति" : "Condition"}
          <select name="condition" required>
            <option value="USABLE">{hi ? "उपयोग योग्य (उपलब्ध स्टॉक में वापस)" : "Usable (returns to available stock)"}</option>
            <option value="DAMAGED">{hi ? "क्षतिग्रस्त (बिक्री योग्य नहीं)" : "Damaged (not sellable)"}</option>
          </select>
        </label>
        <label>
          {hi ? "कारण" : "Reason"}
          <input name="reason" minLength={3} required />
        </label>
        <label>
          {hi ? "क्रेडिट नोट का अनुरोध करें" : "Request a credit note"}
          <input name="creditNoteRequested" type="checkbox" />
        </label>
        <button disabled={busy || !skus.length}>{hi ? "अनुरोध जमा करें" : "Submit request"}</button>
      </form>
      <div className={styles.tableWrap}>
        <table>
          <thead>
            <tr>
              <th>{hi ? "नंबर" : "Number"}</th>
              <th>{hi ? "उत्पाद" : "SKU"}</th>
              <th>{hi ? "मात्रा" : "Qty"}</th>
              <th>{hi ? "स्थिति" : "Condition"}</th>
              <th>{hi ? "स्टेटस" : "Status"}</th>
              <th>{hi ? "क्रेडिट नोट" : "Credit note"}</th>
              <th>{hi ? "कार्रवाई" : "Actions"}</th>
            </tr>
          </thead>
          <tbody>
            {requests.map((r) => (
              <tr key={r.id}>
                <td>{r.requestNumber}</td>
                <td>{r.skuLabel}</td>
                <td>{r.quantity}</td>
                <td>{r.condition}</td>
                <td>{r.status}</td>
                <td>{r.creditNoteRequested ? (hi ? "हाँ" : "Yes") : "—"}</td>
                <td>
                  {r.status === "SUBMITTED" && !r.createdBySelf && (
                    <div className={styles.inlineActions}>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => {
                          const reason = window.prompt(hi ? "स्वीकृति टिप्पणी" : "Approval note");
                          if (reason == null) return;
                          void run("decide-return-request", { requestId: r.id, decision: "APPROVED", reason });
                        }}
                      >
                        {hi ? "स्वीकृत करें" : "Approve"}
                      </button>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => {
                          const reason = window.prompt(hi ? "अस्वीकृति का कारण" : "Reason for rejection");
                          if (reason == null) return;
                          void run("decide-return-request", { requestId: r.id, decision: "REJECTED", reason });
                        }}
                      >
                        {hi ? "अस्वीकृत करें" : "Reject"}
                      </button>
                    </div>
                  )}
                  {r.status === "SUBMITTED" && r.createdBySelf && (
                    <span>{hi ? "स्वतंत्र समीक्षक की प्रतीक्षा" : "Awaiting independent reviewer"}</span>
                  )}
                </td>
              </tr>
            ))}
            {!requests.length && (
              <tr>
                <td colSpan={7}>{hi ? "अभी तक कोई अनुरोध नहीं" : "No requests yet"}</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {message && <p role="status">{message}</p>}
    </section>
  );
}
