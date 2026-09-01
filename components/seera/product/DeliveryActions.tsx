"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import styles from "./WorkflowActions.module.css";

type Line = { id: string; label: string; remaining: number };
type Delivery = { id: string; label: string; lines: Line[] };

export function DeliveryActions({
  language,
  deliveries,
}: {
  language: "EN" | "HI";
  deliveries: Delivery[];
}) {
  const hi = language === "HI";
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [deliveryId, setDeliveryId] = useState(deliveries[0]?.id ?? "");
  const lines = deliveries.find((delivery)=>delivery.id===deliveryId)?.lines ?? [];

  return (
    <section className={styles.panel}>
      <div>
        <small>{hi ? "डिलीवरी निष्पादन" : "DELIVERY EXECUTION"}</small>
        <h2>
          {hi ? "परिणाम और प्राप्ति प्रमाण" : "Outcome & proof of delivery"}
        </h2>
      </div>
      <form
        onSubmit={async (event) => {
          event.preventDefault();
          setBusy(true);
          setMessage("");
          try {
            const form = new FormData(event.currentTarget);
            const payload = {
              deliveryId,
              status: String(form.get("status")),
              receiverName: String(form.get("receiverName") ?? "") || undefined,
              reason: String(form.get("reason") ?? "") || undefined,
              proof: {
                mode: String(form.get("proofMode") ?? "OTHER"),
                reference: String(form.get("proofReference") ?? "").trim(),
                orderId: deliveries.find((delivery) => delivery.id === deliveryId)?.id ?? "",
                deliveryId,
                capturedFrom: "PORTAL",
              },
              lines: lines.map((line) => ({
                lineId: line.id,
                quantity: Number(form.get(`line-${line.id}`) ?? 0),
              })),
            };
            const response = await fetch("/api/distribution/operations", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ action: "complete-delivery", payload }),
            });
            const result = await response.json().catch(() => ({}));
            if (!response.ok)
              throw new Error(
                result?.error?.message ??
                  result?.error?.code ??
                  "Delivery update failed",
              );
            setMessage(
              hi
                ? "डिलीवरी परिणाम सुरक्षित रूप से सहेजा गया।"
                : "Delivery outcome saved securely.",
            );
            router.refresh();
          } catch (error) {
            setMessage(
              error instanceof Error ? error.message : "Delivery update failed",
            );
          } finally {
            setBusy(false);
          }
        }}
      >
        <label>{hi ? "डिलीवरी" : "Delivery"}<select value={deliveryId} onChange={(event)=>setDeliveryId(event.target.value)} required><option value="">{hi ? "ऑर्डर नंबर से चुनें" : "Choose by order number"}</option>{deliveries.map((delivery)=><option key={delivery.id} value={delivery.id}>{delivery.label}</option>)}</select></label>
        <label>
          {hi ? "परिणाम" : "Outcome"}
          <select name="status">
            <option>DELIVERED</option>
            <option>PARTIAL_DELIVERED</option>
            <option>REFUSED</option>
            <option>SHOP_CLOSED</option>
            <option>PAYMENT_ISSUE</option>
            <option>STOCK_UNAVAILABLE</option>
            <option>WRONG_ORDER</option>
            <option>RESCHEDULED</option>
            <option>DAMAGED</option>
            <option>OTHER</option>
          </select>
        </label>
        <label>
          {hi ? "प्राप्तकर्ता" : "Receiver name"}
          <input name="receiverName" />
        </label>
        {lines.map((line) => (
          <label key={line.id}>
            {line.label}
            <input
              name={`line-${line.id}`}
              type="number"
              min="0"
              max={line.remaining}
              step="1"
              defaultValue={line.remaining}
            />
          </label>
        ))}
        <label>
          {hi ? "प्रमाण प्रकार" : "Proof mode"}
          <select name="proofMode">
            <option value="OTP">OTP</option>
            <option value="SIGNATURE">{hi ? "हस्ताक्षर" : "Signature"}</option>
            <option value="PHOTO">{hi ? "फोटो" : "Photo"}</option>
            <option value="OTHER">{hi ? "अन्य" : "Other"}</option>
          </select>
        </label>
        <label>
          {hi ? "प्रमाण संदर्भ" : "Proof reference"}
          <input
            name="proofReference"
            required
            placeholder={hi ? "ओटीपी / हस्ताक्षर / फोटो संदर्भ" : "OTP / signature / photo reference"}
          />
        </label>
        <label>
          {hi ? "कारण / टिप्पणी" : "Reason / note"}
          <input name="reason" />
        </label>
        <button disabled={busy || !deliveryId}>
          {hi ? "डिलीवरी परिणाम सहेजें" : "Save delivery outcome"}
        </button>
      </form>
      {message && <p role="status">{message}</p>}
    </section>
  );
}
