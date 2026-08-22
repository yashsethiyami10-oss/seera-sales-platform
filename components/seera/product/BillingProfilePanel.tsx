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

export type BillingProfileSnapshot = {
  gstRegistered: boolean;
  gstin: string | null;
  state: string;
  stateCode: string;
  invoicePrefix: string;
  verificationStatus: string;
} | null;

// Final commercial closure (Part 6, 22-Aug): Distributor billing profiles simply never existed in
// production (0 rows). This is the Founder/Admin governed path to verify one — deliberately does
// NOT collect a GSTIN here (see setPartnerBillingProfile's own comment): it only reads whatever
// GSTIN is already on the partner's own record, so a Distributor with none on file is correctly
// verified as unregistered/non-GST rather than have a value invented at this screen. To change a
// partner's GSTIN, that must happen on the partner record itself (out of scope of this panel).
export function BillingProfilePanel({
  language,
  ownerType,
  ownerId,
  partnerGstin,
  profile,
}: {
  language: "EN" | "HI";
  ownerType: "DISTRIBUTOR" | "SUPER_STOCKIST" | "COMPANY_DIRECT";
  ownerId: string;
  partnerGstin: string | null;
  profile: BillingProfileSnapshot;
}) {
  const hi = language === "HI",
    router = useRouter(),
    [open, setOpen] = useState(!profile),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  if (profile) {
    return (
      <section className={styles.panel}>
        <div>
          <small>{hi ? "बिलिंग प्रोफ़ाइल" : "BILLING PROFILE"}</small>
          <h2>{hi ? "सत्यापित" : "Verified"}</h2>
        </div>
        <dl className={styles.detail}>
          <div><dt>{hi ? "GST स्थिति" : "GST status"}</dt><dd>{profile.gstRegistered ? `${hi ? "पंजीकृत" : "Registered"} · ${profile.gstin}` : hi ? "अपंजीकृत" : "Unregistered"}</dd></div>
          <div><dt>{hi ? "राज्य" : "State"}</dt><dd>{profile.state} ({profile.stateCode})</dd></div>
          <div><dt>{hi ? "इनवॉइस उपसर्ग" : "Invoice prefix"}</dt><dd>{profile.invoicePrefix}</dd></div>
          <div><dt>{hi ? "स्थिति" : "Status"}</dt><dd>{profile.verificationStatus}</dd></div>
        </dl>
      </section>
    );
  }

  return (
    <section className={styles.panel}>
      <div>
        <small>{hi ? "बिलिंग प्रोफ़ाइल" : "BILLING PROFILE"}</small>
        <h2>{hi ? "कोई बिलिंग प्रोफ़ाइल सत्यापित नहीं" : "No billing profile verified yet"}</h2>
      </div>
      <p className={styles.emptyHint}>
        {hi
          ? "जब तक बिलिंग प्रोफ़ाइल सत्यापित नहीं होती, कोटेशन/इनवॉइस जारी नहीं किए जा सकते।"
          : "Quotations/invoices cannot be issued for this party until a billing profile is verified."}
        {" "}
        {partnerGstin ? (hi ? "इस पार्टी का दर्ज GSTIN मिला।" : "A GSTIN is already on file for this party.") : (hi ? "इस पार्टी के लिए कोई GSTIN दर्ज नहीं है — अपंजीकृत के रूप में सत्यापित होगा।" : "No GSTIN is on file for this party — will be verified as unregistered/non-GST.")}
      </p>
      {!open ? (
        <button type="button" className={styles.primaryBig} onClick={() => setOpen(true)}>
          {hi ? "+ बिलिंग प्रोफ़ाइल सत्यापित करें" : "+ VERIFY BILLING PROFILE"}
        </button>
      ) : (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            setBusy(true);
            setMessage(null);
            void post("set-partner-billing-profile", {
              ownerType,
              ownerId,
              state: String(f.get("state") || ""),
              stateCode: String(f.get("stateCode") || ""),
              invoicePrefix: String(f.get("invoicePrefix") || ""),
            })
              .then(() => {
                setMessage({ ok: true, text: hi ? "बिलिंग प्रोफ़ाइल सत्यापित की गई।" : "Billing profile verified." });
                setOpen(false);
                router.refresh();
              })
              .catch((err) => setMessage({ ok: false, text: err instanceof Error ? err.message : "Could not verify billing profile" }))
              .finally(() => setBusy(false));
          }}
        >
          <label>
            {hi ? "राज्य" : "State"}
            <input name="state" required />
          </label>
          <label>
            {hi ? "राज्य कोड (GST)" : "State code (GST)"}
            <input name="stateCode" required maxLength={2} placeholder="09" />
          </label>
          <label>
            {hi ? "इनवॉइस उपसर्ग" : "Invoice prefix"}
            <input name="invoicePrefix" required placeholder="DIST01-INV" />
          </label>
          <button disabled={busy} className={styles.primaryBig}>
            {hi ? "सत्यापित करें" : "VERIFY BILLING PROFILE"}
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
