"use client";
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

// Part B (Manoj Kumar hybrid territory): the one-time entry point that creates the SINGLE
// Company Direct SeeraPartner row — createCompanyDirectPartner() is a true singleton (safe to
// call more than once, returns the existing row), so this panel never needs a "does one already
// exist" check of its own before rendering. Once created, a Manager assigns individual retailers
// to it via assignRetailerCommercialParty — this panel only creates the party itself.
export function CreateCompanyDirectPartnerPanel({ language }: { language: "EN" | "HI" }) {
  const hi = language === "HI",
    [open, setOpen] = useState(false),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  return (
    <section className={styles.panel}>
      <div>
        <small>{hi ? "कंपनी डायरेक्ट" : "COMPANY DIRECT"}</small>
        <h2>{hi ? "कंपनी डायरेक्ट पार्टी सेट अप करें" : "Set Up Company Direct"}</h2>
      </div>
      {!open ? (
        <button type="button" className={styles.primaryBig} onClick={() => setOpen(true)} style={{ gridColumn: "2" }}>
          {hi ? "+ कंपनी डायरेक्ट जोड़ें" : "+ SET UP COMPANY DIRECT"}
        </button>
      ) : (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            setBusy(true);
            setMessage(null);
            void post("create-company-direct-partner", {
              legalName: String(f.get("legalName") || "") || undefined,
              tradeName: String(f.get("tradeName") || "") || undefined,
              address: { line: String(f.get("address") || ""), city: String(f.get("city") || ""), state: String(f.get("state") || "") },
              notes: String(f.get("notes") || "") || undefined,
              idempotencyKey: key(),
            })
              .then(() => {
                setMessage({ ok: true, text: hi ? "कंपनी डायरेक्ट पार्टी तैयार है।" : "Company Direct party is ready." });
                setOpen(false);
              })
              .catch((err) => setMessage({ ok: false, text: err instanceof Error ? err.message : "Could not set up Company Direct" }))
              .finally(() => setBusy(false));
          }}
        >
          <label>
            {hi ? "कानूनी नाम (वैकल्पिक)" : "Legal name (optional)"}
            <input name="legalName" placeholder="Company Direct" />
          </label>
          <label>
            {hi ? "व्यापार नाम (वैकल्पिक)" : "Trade name (optional)"}
            <input name="tradeName" />
          </label>
          <label>
            {hi ? "पता" : "Address line"}
            <input name="address" required />
          </label>
          <label>
            {hi ? "शहर" : "City"}
            <input name="city" required />
          </label>
          <label>
            {hi ? "राज्य" : "State"}
            <input name="state" required />
          </label>
          <label>
            {hi ? "टिप्पणी (वैकल्पिक)" : "Notes (optional)"}
            <input name="notes" />
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
