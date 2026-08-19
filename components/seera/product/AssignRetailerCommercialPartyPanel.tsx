"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import styles from "./WorkflowActions.module.css";

async function post(action: string, payload: unknown) {
  const r = await fetch("/api/manager/operations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, payload }),
    }),
    d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d?.error?.message ?? d?.error?.code ?? "Action failed");
  return d;
}

// Part B (Manoj Kumar hybrid territory): the missing UI for assignRetailerCommercialParty
// (manager-service.ts) — the backend action and API wiring already existed and were tested, but
// had no way for a Manager to actually reach them. Lets a Manager flip ONE retailer between its
// current Distributor and the Founder's Company Direct partner (or vice versa) at any time, with a
// mandatory reason — exactly the mechanism a hybrid territory like Manoj's needs, per-retailer.
export function AssignRetailerCommercialPartyPanel({
  language,
  retailerId,
  currentPartnerId,
  parties,
}: {
  language: "EN" | "HI";
  retailerId: string;
  currentPartnerId: string | null;
  parties: { id: string; label: string; type: "DISTRIBUTOR" | "COMPANY_DIRECT" }[];
}) {
  const hi = language === "HI",
    router = useRouter(),
    [open, setOpen] = useState(false),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  const current = parties.find((p) => p.id === currentPartnerId);

  return (
    <section className={styles.panel}>
      <div>
        <small>{hi ? "आपूर्ति पक्ष" : "SUPPLYING PARTY"}</small>
        <h2>
          {hi ? "वर्तमान: " : "Current: "}
          {current ? `${current.label} (${current.type === "COMPANY_DIRECT" ? (hi ? "कंपनी डायरेक्ट" : "Company Direct") : hi ? "वितरक" : "Distributor"})` : hi ? "कोई नहीं सौंपा गया" : "Unassigned"}
        </h2>
      </div>
      {!open ? (
        <button type="button" className={styles.primaryBig} onClick={() => setOpen(true)} style={{ gridColumn: "2" }}>
          {hi ? "आपूर्ति पक्ष बदलें" : "Change supplying party"}
        </button>
      ) : (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            setBusy(true);
            setMessage(null);
            void post("assign-retailer-commercial-party", {
              retailerId,
              partnerId: String(f.get("partnerId") || ""),
              reason: String(f.get("reason") || ""),
            })
              .then(() => {
                setMessage({ ok: true, text: hi ? "आपूर्ति पक्ष अपडेट किया गया।" : "Supplying party updated." });
                setOpen(false);
                router.refresh();
              })
              .catch((err) => setMessage({ ok: false, text: err instanceof Error ? err.message : "Could not update supplying party" }))
              .finally(() => setBusy(false));
          }}
        >
          <label>
            {hi ? "नया आपूर्ति पक्ष" : "New supplying party"}
            <select name="partnerId" defaultValue="" required>
              <option value="" disabled>
                {hi ? "चुनें" : "Choose"}
              </option>
              {parties.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label} — {p.type === "COMPANY_DIRECT" ? (hi ? "कंपनी डायरेक्ट" : "Company Direct") : hi ? "वितरक" : "Distributor"}
                </option>
              ))}
            </select>
          </label>
          <label>
            {hi ? "कारण (आवश्यक)" : "Reason (required)"}
            <input name="reason" required minLength={3} />
          </label>
          <button disabled={busy} className={styles.primaryBig}>
            {hi ? "सहेजें" : "SAVE"}
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
