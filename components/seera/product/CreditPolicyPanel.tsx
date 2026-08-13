"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import styles from "./WorkflowActions.module.css";

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

export function CreditPolicyPanel({
  language,
  superStockistId,
  distributors,
}: {
  language: "EN" | "HI";
  superStockistId: string;
  distributors: { value: string; label: string }[];
}) {
  const hi = language === "HI",
    router = useRouter(),
    [distributorId, setDistributorId] = useState(""),
    [creditEnabled, setCreditEnabled] = useState(true),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  return (
    <section className={styles.panel}>
      <div>
        <small>{hi ? "क्रेडिट नीति" : "CREDIT POLICY"}</small>
        <h2>{hi ? "वितरक की क्रेडिट सीमा बदलें" : "Edit a Distributor's credit policy"}</h2>
      </div>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          const f = new FormData(e.currentTarget);
          if (!distributorId) return;
          setBusy(true);
          setMessage(null);
          void post("update-distributor-credit", {
            superStockistId,
            distributorId,
            creditEnabled,
            creditLimit: Number(f.get("creditLimit") || 0),
            creditDays: Number(f.get("creditDays") || 0),
            warningThreshold: f.get("warningThreshold") ? Number(f.get("warningThreshold")) : undefined,
            blockThreshold: f.get("blockThreshold") ? Number(f.get("blockThreshold")) : undefined,
            graceEnabled: String(f.get("graceEnabled")) === "yes",
            graceDays: Number(f.get("graceDays") || 0),
            changeReason: String(f.get("changeReason") || ""),
          })
            .then(() => {
              setMessage({ ok: true, text: hi ? "क्रेडिट नीति अद्यतन की गई।" : "Credit policy updated." });
              router.refresh();
            })
            .catch((err) => setMessage({ ok: false, text: err instanceof Error ? err.message : "Could not update credit policy" }))
            .finally(() => setBusy(false));
        }}
      >
        <label>
          {hi ? "वितरक" : "Distributor"}
          <select value={distributorId} onChange={(e) => setDistributorId(e.target.value)} required>
            <option value="">{hi ? "नाम से चुनें" : "Choose by name"}</option>
            {distributors.map((d) => (
              <option key={d.value} value={d.value}>
                {d.label}
              </option>
            ))}
          </select>
        </label>
        <label>
          {hi ? "क्रेडिट स्वीकृत?" : "Credit allowed?"}
          <select value={creditEnabled ? "yes" : "no"} onChange={(e) => setCreditEnabled(e.target.value === "yes")}>
            <option value="yes">{hi ? "हाँ" : "Yes"}</option>
            <option value="no">{hi ? "नहीं" : "No"}</option>
          </select>
        </label>
        <label>
          {hi ? "नई क्रेडिट सीमा" : "New credit limit"}
          <input name="creditLimit" type="number" min="0" step="0.01" required />
        </label>
        <label>
          {hi ? "क्रेडिट दिन" : "Credit days"}
          <input name="creditDays" type="number" min="0" step="1" required />
        </label>
        <label>
          {hi ? "चेतावनी सीमा (वैकल्पिक)" : "Warning threshold (optional)"}
          <input name="warningThreshold" type="number" min="0" step="0.01" />
        </label>
        <label>
          {hi ? "ब्लॉक सीमा (वैकल्पिक)" : "Block threshold (optional)"}
          <input name="blockThreshold" type="number" min="0" step="0.01" />
        </label>
        <label>
          {hi ? "ग्रेस स्वीकृत?" : "Grace allowed?"}
          <select name="graceEnabled" defaultValue="no">
            <option value="yes">{hi ? "हाँ" : "Yes"}</option>
            <option value="no">{hi ? "नहीं" : "No"}</option>
          </select>
        </label>
        <label>
          {hi ? "ग्रेस दिन (Grace Days)" : "Grace Days"}
          <input name="graceDays" type="number" min="0" step="1" defaultValue={0} />
        </label>
        <label>
          {hi ? "परिवर्तन का कारण" : "Reason for change"}
          <input name="changeReason" minLength={3} required />
        </label>
        <button disabled={busy || !distributorId} className={styles.primaryBig}>
          {hi ? "क्रेडिट नीति सहेजें" : "SAVE CREDIT POLICY"}
        </button>
      </form>
      {message && (
        <p role="status" data-ok={message.ok} className={message.ok ? undefined : styles.cardError}>
          {message.text}
        </p>
      )}
    </section>
  );
}
