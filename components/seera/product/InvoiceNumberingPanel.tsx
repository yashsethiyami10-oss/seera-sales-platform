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

export type InvoiceNumberingStatus = {
  financialYear: string;
  currentPrefix: string | null;
  lastUsedNumber: string | null;
  nextSuggested: string;
  configured: boolean;
};

// Final Master Revision (Part 9, 22-Aug): a Distributor/S.S. controls their own real physical/
// manual invoice sequence — Seera must never force its own arbitrary numbering on top of it. This
// lets them set/confirm the prefix and current sequence themselves before their first real
// invoice, matching their existing invoice-book/accounting sequence, or leave it pending.
export function InvoiceNumberingPanel({
  language,
  ownerType,
  ownerId,
  status,
}: {
  language: "EN" | "HI";
  ownerType: "DISTRIBUTOR" | "SUPER_STOCKIST";
  ownerId: string;
  status: InvoiceNumberingStatus;
}) {
  const hi = language === "HI",
    router = useRouter(),
    [open, setOpen] = useState(!status.configured),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  return (
    <section className={styles.panel}>
      <div>
        <small>{hi ? "बिलिंग प्रोफ़ाइल / इनवॉइस नंबरिंग" : "BILLING PROFILE / INVOICE NUMBERING"}</small>
        <h2>{hi ? "टैक्स इनवॉइस नंबरिंग" : "Tax invoice numbering"}</h2>
      </div>
      <dl className={styles.detail}>
        <div><dt>{hi ? "वित्त वर्ष" : "Financial year"}</dt><dd>{status.financialYear}</dd></div>
        <div><dt>{hi ? "वर्तमान उपसर्ग" : "Current prefix"}</dt><dd>{status.currentPrefix ?? (hi ? "कॉन्फ़िगर नहीं" : "Not configured")}</dd></div>
        <div><dt>{hi ? "अंतिम प्रयुक्त नंबर" : "Last used number"}</dt><dd>{status.lastUsedNumber ?? "—"}</dd></div>
        <div><dt>{hi ? "अगला सुझाया गया" : "Next suggested"}</dt><dd>{status.currentPrefix ? `${status.currentPrefix}/INV/${status.financialYear}/${status.nextSuggested.padStart(6, "0")}` : status.nextSuggested}</dd></div>
      </dl>
      <p className={styles.emptyHint}>
        {hi
          ? "इसे अपने मौजूदा इनवॉइस-बुक/अकाउंटिंग क्रम से मिलाने के लिए सेट करें। Seera अगला नंबर अपने आप सुझाएगा।"
          : "Set this to match your existing invoice-book/accounting sequence. Seera will suggest the next number automatically."}
      </p>
      {!open ? (
        <button type="button" className={styles.primaryBig} onClick={() => setOpen(true)}>
          {status.configured ? (hi ? "क्रम बदलें" : "CHANGE SEQUENCE") : (hi ? "+ नंबरिंग सेट करें" : "+ SET NUMBERING")}
        </button>
      ) : (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            setBusy(true);
            setMessage(null);
            void post("configure-invoice-numbering", {
              ownerType,
              ownerId,
              documentType: "TAX_INVOICE",
              prefix: String(f.get("prefix") || ""),
              nextNumber: Number(f.get("nextNumber")),
              reason: String(f.get("reason") || ""),
            })
              .then(() => {
                setMessage({ ok: true, text: hi ? "इनवॉइस नंबरिंग सहेजी गई।" : "Invoice numbering saved." });
                setOpen(false);
                router.refresh();
              })
              .catch((err) => setMessage({ ok: false, text: err instanceof Error ? err.message : "Could not save numbering" }))
              .finally(() => setBusy(false));
          }}
        >
          <label>
            {hi ? "इनवॉइस उपसर्ग" : "Invoice prefix"}
            <input name="prefix" required defaultValue={status.currentPrefix ?? ""} placeholder="RTP/26-27" />
          </label>
          <label>
            {hi ? "अगला नंबर" : "Next number"}
            <input name="nextNumber" type="number" min={1} step={1} required defaultValue={status.nextSuggested} />
          </label>
          <label>
            {hi ? "कारण" : "Reason"}
            <input name="reason" required minLength={3} placeholder={hi ? "उदा. मेरी मौजूदा इनवॉइस बुक से मिलान" : "e.g. Matching my existing invoice book"} />
          </label>
          <button disabled={busy} className={styles.primaryBig}>
            {hi ? "सहेजें" : "SAVE NUMBERING"}
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
