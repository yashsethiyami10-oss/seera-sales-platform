"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import styles from "./WorkflowActions.module.css";

type Option = { value: string; label: string; meta?: string };

export function RetailerOrderActions({
  language,
  retailers,
  skus,
}: {
  language: "EN" | "HI";
  retailers: Option[];
  skus: Option[];
}) {
  const hi = language === "HI";
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  return (
    <section className={styles.panel}>
      <div>
        <small>{hi ? "स्वयं-सेवा ऑर्डर" : "SELF-SERVICE ORDER"}</small>
        <h2>
          {hi
            ? "अपने वितरक को पुनः ऑर्डर भेजें"
            : "Send a reorder to your distributor"}
        </h2>
      </div>
      <form
        onSubmit={async (event) => {
          event.preventDefault();
          setBusy(true);
          setMessage("");
          try {
            const form = new FormData(event.currentTarget);
            const response = await fetch("/api/retailer/orders", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                retailerId: String(form.get("retailerId")),
                requestedDeliveryAt:
                  String(form.get("requestedDeliveryAt") || "") || undefined,
                notes: String(form.get("notes") || "") || undefined,
                idempotencyKey: `retailer-${crypto.randomUUID()}`,
                lines: [
                  {
                    skuId: String(form.get("skuId")),
                    quantity: Number(form.get("quantity")),
                  },
                ],
              }),
            });
            const result = await response.json().catch(() => ({}));
            if (!response.ok)
              throw new Error(
                result?.error?.message ??
                  result?.error?.code ??
                  "Order could not be submitted",
              );
            setMessage(
              hi
                ? `ऑर्डर ${result.orderNumber ?? ""} वितरक को भेजा गया।`
                : `Order ${result.orderNumber ?? ""} sent to the distributor.`,
            );
            router.refresh();
          } catch (error) {
            setMessage(
              error instanceof Error
                ? error.message
                : "Order could not be submitted",
            );
          } finally {
            setBusy(false);
          }
        }}
      >
        <label>
          {hi ? "दुकान" : "Retail business"}
          <select name="retailerId" required>
            {retailers.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
                {option.meta ? ` · ${option.meta}` : ""}
              </option>
            ))}
          </select>
        </label>
        <label>
          {hi ? "उत्पाद" : "Product"}
          <select name="skuId" required>
            {skus.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
                {option.meta ? ` · ${option.meta}` : ""}
              </option>
            ))}
          </select>
        </label>
        <label>
          {hi ? "मात्रा" : "Quantity"}
          <input
            name="quantity"
            type="number"
            min="1"
            step="1"
            defaultValue="1"
            required
          />
        </label>
        <label>
          {hi ? "अनुरोधित डिलीवरी" : "Requested delivery"}
          <input name="requestedDeliveryAt" type="date" />
        </label>
        <label>
          {hi ? "टिप्पणी" : "Order note"}
          <input name="notes" maxLength={500} />
        </label>
        <button disabled={busy || !retailers.length || !skus.length}>
          {hi ? "ऑर्डर भेजें" : "Submit order"}
        </button>
      </form>
      {message && <p role="status">{message}</p>}
    </section>
  );
}
