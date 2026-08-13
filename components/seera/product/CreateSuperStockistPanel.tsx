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

// Founder/Admin UAT correction (P0, section 2-3): createSuperStockist() had zero API/UI wiring —
// this is the first application-code path a real user can use to create a Super Stockist. Mirrors
// AddDistributorPanel's collapsed-button/expand-form/one-shot-success pattern deliberately, so the
// two "Add a Party" workflows feel identical to a Founder using them side by side. `redirectBase`
// (a plain string, not a callback — this renders under a Server Component list page, which cannot
// pass a JS closure across the boundary) sends the Founder straight to the new S.S.'s 360/"Set Up
// Login" page after creation, per the spec's "open/select same new S.S." next-action requirement.
export function CreateSuperStockistPanel({ language, redirectBase }: { language: "EN" | "HI"; redirectBase?: string }) {
  const hi = language === "HI",
    router = useRouter(),
    [open, setOpen] = useState(false),
    [captureBilling, setCaptureBilling] = useState(true),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  return (
    <section className={styles.panel}>
      <div>
        <small>{hi ? "सुपर स्टॉकिस्ट" : "SUPER STOCKISTS"}</small>
        <h2>{hi ? "नया सुपर स्टॉकिस्ट जोड़ें" : "Add a Super Stockist"}</h2>
      </div>
      {!open ? (
        <button type="button" className={styles.primaryBig} onClick={() => setOpen(true)} style={{ gridColumn: "2" }}>
          {hi ? "+ सुपर स्टॉकिस्ट जोड़ें" : "+ ADD SUPER STOCKIST"}
        </button>
      ) : (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            setBusy(true);
            setMessage(null);
            void post("create-super-stockist", {
              firmName: String(f.get("firmName") || ""),
              tradeName: String(f.get("tradeName") || "") || undefined,
              address: { line: String(f.get("address") || ""), city: String(f.get("city") || ""), state: String(f.get("state") || "") },
              mobile: String(f.get("mobile") || ""),
              ownerName: String(f.get("ownerName") || "") || undefined,
              alternateMobile: String(f.get("alternateMobile") || "") || undefined,
              email: String(f.get("email") || "") || undefined,
              gstin: String(f.get("gstin") || "") || undefined,
              pincode: String(f.get("pincode") || "") || undefined,
              notes: String(f.get("notes") || "") || undefined,
              billingProfile: captureBilling
                ? {
                    state: String(f.get("state") || ""),
                    stateCode: String(f.get("stateCode") || ""),
                    invoicePrefix: String(f.get("invoicePrefix") || ""),
                  }
                : undefined,
              idempotencyKey: key(),
            })
              .then((result: { id: string }) => {
                setMessage({ ok: true, text: hi ? "सुपर स्टॉकिस्ट जोड़ा गया।" : "Super Stockist added." });
                setOpen(false);
                if (redirectBase) router.push(`${redirectBase}/${result.id}`);
                else router.refresh();
              })
              .catch((err) => setMessage({ ok: false, text: err instanceof Error ? err.message : "Could not add Super Stockist" }))
              .finally(() => setBusy(false));
          }}
        >
          <label>
            {hi ? "फर्म / व्यवसाय का नाम" : "Firm / Business name"}
            <input name="firmName" required />
          </label>
          <label>
            {hi ? "व्यापार नाम (वैकल्पिक)" : "Legal / trade name (optional)"}
            <input name="tradeName" />
          </label>
          <label>
            {hi ? "मालिक का नाम" : "Owner name"}
            <input name="ownerName" required />
          </label>
          <label>
            {hi ? "प्राथमिक मोबाइल" : "Primary mobile"}
            <input name="mobile" type="tel" required minLength={10} />
          </label>
          <label>
            {hi ? "वैकल्पिक मोबाइल (वैकल्पिक)" : "Alternate mobile (optional)"}
            <input name="alternateMobile" type="tel" />
          </label>
          <label>
            {hi ? "ईमेल (वैकल्पिक)" : "Email (optional)"}
            <input name="email" type="email" />
          </label>
          <label>
            {hi ? "GSTIN" : "GSTIN"}
            <input name="gstin" />
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
            {hi ? "पिनकोड" : "Pincode"}
            <input name="pincode" />
          </label>
          <label>
            {hi ? "बिलिंग प्रोफ़ाइल अभी दर्ज करें?" : "Capture billing profile now?"}
            <select value={captureBilling ? "yes" : "no"} onChange={(e) => setCaptureBilling(e.target.value === "yes")}>
              <option value="yes">{hi ? "हाँ" : "Yes"}</option>
              <option value="no">{hi ? "बाद में" : "Later"}</option>
            </select>
          </label>
          {captureBilling && (
            <>
              <label>
                {hi ? "राज्य कोड (GST)" : "State code (GST)"}
                <input name="stateCode" required maxLength={2} placeholder="27" />
              </label>
              <label>
                {hi ? "इनवॉइस उपसर्ग" : "Invoice prefix"}
                <input name="invoicePrefix" required placeholder="SS01-INV" />
              </label>
            </>
          )}
          <label>
            {hi ? "टिप्पणी (वैकल्पिक)" : "Notes (optional)"}
            <input name="notes" />
          </label>
          <button disabled={busy} className={styles.primaryBig}>
            {hi ? "सहेजें" : "SAVE SUPER STOCKIST"}
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
