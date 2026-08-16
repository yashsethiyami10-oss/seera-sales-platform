"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import styles from "./WorkflowActions.module.css";

type Row = {
  town: string;
  firm: string;
  mobile: string;
  status: "CREATED" | "RECONCILED" | "CONFLICT";
  partnerId?: string;
  userId?: string;
  loginEmail?: string;
  temporaryPassword?: string;
  note?: string;
};

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

// Founder-authorized, one-time production onboarding for the 10 real distributors under M/s Ratan
// Products & Traders (see lib/sales-distribution/ratan-onboarding-service.ts for the governed,
// idempotent, row-isolated service this calls). This panel exists only to trigger that one action
// and reveal its once-only credential output — it contains no onboarding data or business logic of
// its own. Auto-hides once all 10 rows exist (OperationalWorkspace only renders this panel while the
// count under Ratan's Super Stockist is below 10), matching the Founder's instruction to
// remove/hide the one-time action after successful use.
export function RatanBulkOnboardPanel({ language }: { language: "EN" | "HI" }) {
  const hi = language === "HI",
    router = useRouter(),
    [busy, setBusy] = useState(false),
    [results, setResults] = useState<Row[] | null>(null),
    [error, setError] = useState<string | null>(null);

  function downloadCsv() {
    if (!results) return;
    const header = "Town,Firm,Mobile,Status,LoginEmail,TemporaryPassword,Note";
    const lines = results.map((r) =>
      [r.town, r.firm, r.mobile, r.status, r.loginEmail ?? "", r.temporaryPassword ?? "", r.note ?? ""]
        .map((v) => `"${String(v).replace(/"/g, '""')}"`)
        .join(","),
    );
    const blob = new Blob([[header, ...lines].join("\n")], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "ratan-distributor-onboarding-credentials.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  if (results) {
    return (
      <section className={styles.panel}>
        <div>
          <small>{hi ? "वितरक ऑनबोर्डिंग" : "DISTRIBUTOR ONBOARDING"}</small>
          <h2>{hi ? "परिणाम — इसे केवल एक बार दिखाया जाएगा" : "Result — shown only once"}</h2>
        </div>
        <p role="status">
          {hi
            ? "अभी क्रेडेंशियल CSV डाउनलोड करें और सुरक्षित रूप से साझा करें। पेज छोड़ने के बाद पासवर्ड फिर से नहीं दिखाए जा सकते।"
            : "Download the credential CSV now and share it securely. Passwords cannot be shown again after you leave this page."}
        </p>
        <div className={styles.tableWrap}>
          <table style={{ width: "100%" }}>
            <thead>
              <tr>
                <th>{hi ? "कस्बा" : "Town"}</th>
                <th>{hi ? "फर्म" : "Firm"}</th>
                <th>{hi ? "स्थिति" : "Status"}</th>
                <th>{hi ? "लॉगिन" : "Login"}</th>
                <th>{hi ? "पासवर्ड" : "Password"}</th>
                <th>{hi ? "टिप्पणी" : "Note"}</th>
              </tr>
            </thead>
            <tbody>
              {results.map((r) => (
                <tr key={r.mobile}>
                  <td>{r.town}</td>
                  <td>{r.firm}</td>
                  <td>{r.status}</td>
                  <td>{r.loginEmail ?? "—"}</td>
                  <td>{r.temporaryPassword ? <code>{r.temporaryPassword}</code> : "—"}</td>
                  <td>{r.note ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <button type="button" className={styles.primaryBig} onClick={downloadCsv}>
          {hi ? "क्रेडेंशियल CSV डाउनलोड करें" : "DOWNLOAD CREDENTIAL CSV"}
        </button>
        <button
          type="button"
          className={styles.secondaryBig}
          onClick={() => {
            setResults(null);
            router.refresh();
          }}
        >
          {hi ? "पूर्ण" : "DONE"}
        </button>
      </section>
    );
  }

  return (
    <section className={styles.panel}>
      <div>
        <small>{hi ? "वितरक ऑनबोर्डिंग" : "DISTRIBUTOR ONBOARDING"}</small>
        <h2>{hi ? "रतन प्रोडक्ट्स एंड ट्रेडर्स — 10 वितरक" : "Ratan Products & Traders — 10 Distributors"}</h2>
      </div>
      <p>
        {hi
          ? "M/s Ratan Products & Traders के अंतर्गत सभी 10 प्राधिकृत वितरकों और उनके लॉगिन को एक क्लिक में जोड़ता है। पहले से मौजूद कोई भी पंक्ति बिना डुप्लिकेट बनाए छोड़ दी जाएगी।"
          : "Creates all 10 Founder-authorized distributors under M/s Ratan Products & Traders and one login each, in a single click. Any row that already exists is left untouched — safe to run more than once."}
      </p>
      <button
        type="button"
        className={styles.primaryBig}
        disabled={busy}
        onClick={() => {
          setBusy(true);
          setError(null);
          void post("bulk-onboard-ratan-distributors", {})
            .then((result: Row[]) => setResults(result))
            .catch((err) => setError(err instanceof Error ? err.message : "Could not run onboarding"))
            .finally(() => setBusy(false));
        }}
      >
        {busy ? (hi ? "चल रहा है…" : "RUNNING…") : hi ? "10 वितरक ऑनबोर्ड करें" : "ONBOARD 10 RATAN DISTRIBUTORS"}
      </button>
      {error && (
        <p role="status" data-ok={false} className={styles.cardError}>
          {error}
        </p>
      )}
    </section>
  );
}
