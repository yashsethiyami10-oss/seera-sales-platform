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

// Founder/Admin UAT correction (P0, section 13): assignedSuperStockistId was previously set once
// at Distributor creation with no application-code path to change it again. This does not rewrite
// history — historical orders/documents already snapshot their commercial party at the time they
// were created; only future routing changes.
export function ReassignDistributorPanel({
  language,
  distributorId,
  currentSuperStockistId,
  superStockists,
}: {
  language: "EN" | "HI";
  distributorId: string;
  currentSuperStockistId: string | null;
  superStockists: { value: string; label: string }[];
}) {
  const hi = language === "HI",
    router = useRouter(),
    [open, setOpen] = useState(false),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const options = superStockists.filter((s) => s.value !== currentSuperStockistId);

  return (
    <section className={styles.panel}>
      <div>
        <small>{hi ? "पुनः असाइन करें" : "REASSIGNMENT"}</small>
        <h2>{hi ? "सुपर स्टॉकिस्ट बदलें" : "Reassign Super Stockist"}</h2>
      </div>
      {!open ? (
        <button type="button" className={styles.secondaryBig} onClick={() => setOpen(true)} disabled={options.length === 0} style={{ gridColumn: "2" }}>
          {hi ? "एस.एस. पुनः असाइन करें" : "REASSIGN S.S."}
        </button>
      ) : (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            setBusy(true);
            setMessage(null);
            void post("reassign-distributor", {
              distributorId,
              newSuperStockistId: String(f.get("newSuperStockistId") || ""),
              effectiveFrom: String(f.get("effectiveFrom") || new Date().toISOString().slice(0, 10)),
              reason: String(f.get("reason") || ""),
              idempotencyKey: key(),
            })
              .then(() => {
                setMessage({ ok: true, text: hi ? "पुनः असाइनमेंट पूर्ण हुआ।" : "Reassignment complete." });
                setOpen(false);
                router.refresh();
              })
              .catch((err) => setMessage({ ok: false, text: err instanceof Error ? err.message : "Could not reassign Distributor" }))
              .finally(() => setBusy(false));
          }}
        >
          <label>
            {hi ? "नया सुपर स्टॉकिस्ट" : "New Super Stockist"}
            <select name="newSuperStockistId" required defaultValue="">
              <option value="" disabled>
                {hi ? "नाम से चुनें" : "Choose by name"}
              </option>
              {options.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <label>
            {hi ? "प्रभावी तिथि" : "Effective date"}
            <input name="effectiveFrom" type="date" required defaultValue={new Date().toISOString().slice(0, 10)} />
          </label>
          <label>
            {hi ? "कारण" : "Reason"}
            <input name="reason" minLength={3} required />
          </label>
          <button disabled={busy} className={styles.primaryBig}>
            {hi ? "पुष्टि करें" : "CONFIRM REASSIGNMENT"}
          </button>
          <button type="button" className={styles.secondaryBig} disabled={busy} onClick={() => setOpen(false)}>
            {hi ? "रद्द करें" : "Cancel"}
          </button>
        </form>
      )}
      {message && (
        <p role="status" data-ok={message.ok} className={message.ok ? undefined : styles.cardError}>
          {message.text}
        </p>
      )}
    </section>
  );
}
