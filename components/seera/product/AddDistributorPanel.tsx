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

// Founder/Admin UAT correction (P0, section 6): this panel originally only worked from inside a
// specific Super Stockist's own portal, where superStockistId was implicitly the acting user's
// own party. Founder-level "Add Distributor" needs to onboard a Distributor under ANY Super
// Stockist, so it must pick the target explicitly — a real searchable select, never a raw Partner
// ID input, per the Founder's own instruction. Passing `superStockists` (instead of a fixed
// `superStockistId`) switches the panel into that mode without duplicating the form.
// `redirectBase` (a plain string, not a callback — this renders under a Server Component list
// page, which cannot pass a JS closure across that boundary) sends the caller straight to the new
// Distributor's 360/"Set Up Login" page after creation, per the spec's "open/select same new
// Distributor" next-action requirement.
export function AddDistributorPanel({
  language,
  superStockistId,
  superStockists,
  redirectBase,
}: {
  language: "EN" | "HI";
  superStockistId?: string;
  superStockists?: { value: string; label: string }[];
  redirectBase?: string;
}) {
  const hi = language === "HI",
    router = useRouter(),
    [open, setOpen] = useState(false),
    [creditEnabled, setCreditEnabled] = useState(true),
    [busy, setBusy] = useState(false),
    [selectedSuperStockistId, setSelectedSuperStockistId] = useState(superStockistId ?? superStockists?.[0]?.value ?? ""),
    [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const founderMode = !superStockistId && Boolean(superStockists);

  return (
    <section className={styles.panel}>
      <div>
        <small>{hi ? "वितरक" : "DISTRIBUTORS"}</small>
        <h2>{hi ? "नया वितरक जोड़ें" : "Add a Distributor"}</h2>
      </div>
      {!open ? (
        <button type="button" className={styles.primaryBig} onClick={() => setOpen(true)} style={{ gridColumn: "2" }}>
          {hi ? "+ वितरक जोड़ें" : "+ ADD DISTRIBUTOR"}
        </button>
      ) : (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            const targetSuperStockistId = superStockistId ?? selectedSuperStockistId;
            if (!targetSuperStockistId) {
              setMessage({ ok: false, text: hi ? "सुपर स्टॉकिस्ट चुनें।" : "Choose a Super Stockist." });
              return;
            }
            setBusy(true);
            setMessage(null);
            void post("add-distributor", {
              superStockistId: targetSuperStockistId,
              firmName: String(f.get("firmName") || ""),
              address: { line: String(f.get("address") || ""), city: String(f.get("city") || ""), state: String(f.get("state") || "") },
              mobile: String(f.get("mobile") || ""),
              ownerName: String(f.get("ownerName") || "") || undefined,
              alternateMobile: String(f.get("alternateMobile") || "") || undefined,
              email: String(f.get("email") || "") || undefined,
              gstin: String(f.get("gstin") || "") || undefined,
              pincode: String(f.get("pincode") || "") || undefined,
              notes: String(f.get("notes") || "") || undefined,
              creditEnabled,
              creditLimit: creditEnabled ? Number(f.get("creditLimit") || 0) : undefined,
              creditDays: creditEnabled ? Number(f.get("creditDays") || 0) : undefined,
              warningThreshold: creditEnabled && f.get("warningThreshold") ? Number(f.get("warningThreshold")) : undefined,
              blockThreshold: creditEnabled && f.get("blockThreshold") ? Number(f.get("blockThreshold")) : undefined,
              graceEnabled: creditEnabled ? String(f.get("graceEnabled")) === "yes" : undefined,
              graceDays: creditEnabled ? Number(f.get("graceDays") || 0) : undefined,
              idempotencyKey: key(),
            })
              .then((result: { partner: { id: string } }) => {
                setMessage({ ok: true, text: hi ? "वितरक जोड़ा गया।" : "Distributor added." });
                setOpen(false);
                if (redirectBase) router.push(`${redirectBase}/${result.partner.id}`);
                else router.refresh();
              })
              .catch((err) => setMessage({ ok: false, text: err instanceof Error ? err.message : "Could not add Distributor" }))
              .finally(() => setBusy(false));
          }}
        >
          {founderMode && (
            <label>
              {hi ? "सुपर स्टॉकिस्ट चुनें" : "Assigned Super Stockist"}
              <select value={selectedSuperStockistId} onChange={(e) => setSelectedSuperStockistId(e.target.value)} required>
                <option value="">{hi ? "नाम से चुनें" : "Choose by name"}</option>
                {superStockists?.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
          )}
          <label>
            {hi ? "फर्म / व्यवसाय का नाम" : "Firm / Business name"}
            <input name="firmName" required />
          </label>
          <label>
            {hi ? "क्षेत्र / पता" : "Area / Address"}
            <input name="address" required />
          </label>
          <label>
            {hi ? "शहर / कस्बा" : "Town / City"}
            <input name="city" required />
          </label>
          <label>
            {hi ? "राज्य" : "State"}
            <input name="state" required defaultValue="Uttar Pradesh" />
          </label>
          <label>
            {hi ? "प्राथमिक मोबाइल" : "Primary mobile"}
            <input name="mobile" type="tel" required minLength={10} />
          </label>
          <label>
            {hi ? "मालिक / संपर्क व्यक्ति (वैकल्पिक)" : "Owner / Contact person (optional)"}
            <input name="ownerName" />
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
            {hi ? "GSTIN (वैकल्पिक)" : "GSTIN (optional)"}
            <input name="gstin" />
          </label>
          <label>
            {hi ? "पिनकोड (वैकल्पिक)" : "Pincode (optional)"}
            <input name="pincode" />
          </label>
          <label>
            {hi ? "क्रेडिट स्वीकृत?" : "Credit allowed?"}
            <select value={creditEnabled ? "yes" : "no"} onChange={(e) => setCreditEnabled(e.target.value === "yes")}>
              <option value="yes">{hi ? "हाँ" : "Yes"}</option>
              <option value="no">{hi ? "नहीं" : "No"}</option>
            </select>
          </label>
          {creditEnabled && (
            <>
              <label>
                {hi ? "क्रेडिट सीमा" : "Credit limit"}
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
            </>
          )}
          <label>
            {hi ? "टिप्पणी (वैकल्पिक)" : "Notes (optional)"}
            <input name="notes" />
          </label>
          <button disabled={busy} className={styles.primaryBig}>
            {hi ? "सहेजें" : "SAVE DISTRIBUTOR"}
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
