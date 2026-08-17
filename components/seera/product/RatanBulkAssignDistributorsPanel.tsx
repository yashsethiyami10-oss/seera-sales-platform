"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import styles from "./WorkflowActions.module.css";

type Row = { distributorId: string; distributorLabel: string; status: "CREATED" | "ALREADY_EXISTED" };
type Result = { executiveName: string; results: Row[]; created: number; alreadyExisted: number };

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

// Founder-authorized, ONE-TIME convenience over the permanent "+ ASSIGN DISTRIBUTOR" panel —
// calls the exact same governed assignDistributorToExecutive service once per Ratan Distributor
// (see bulkAssignRatanDistributorsToSoleExecutive in operational-service.ts), just sparing 10
// repetitive manual submissions for this one known, bounded target. Auto-hides once the sole
// active Executive already has all 10 (OperationalWorkspace only renders this panel while that
// count is below 10), matching this session's established pattern for one-time bulk actions.
export function RatanBulkAssignDistributorsPanel({ language }: { language: "EN" | "HI" }) {
  const hi = language === "HI",
    router = useRouter(),
    [busy, setBusy] = useState(false),
    [result, setResult] = useState<Result | null>(null),
    [error, setError] = useState<string | null>(null);

  if (result) {
    return (
      <section className={styles.panel}>
        <div>
          <small>{hi ? "वितरक असाइनमेंट" : "DISTRIBUTOR ASSIGNMENT"}</small>
          <h2>{hi ? "परिणाम" : "Result"}</h2>
        </div>
        <p role="status">
          {result.executiveName}: {result.created} {hi ? "नई असाइनमेंट बनाई गईं" : "created"}, {result.alreadyExisted} {hi ? "पहले से मौजूद थीं" : "already existed"}
        </p>
        <div className={styles.tableWrap}>
          <table style={{ width: "100%" }}>
            <thead>
              <tr>
                <th>{hi ? "वितरक" : "Distributor"}</th>
                <th>{hi ? "स्थिति" : "Status"}</th>
              </tr>
            </thead>
            <tbody>
              {result.results.map((r) => (
                <tr key={r.distributorId}>
                  <td>{r.distributorLabel}</td>
                  <td>{r.status}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <button
          type="button"
          className={styles.secondaryBig}
          onClick={() => {
            setResult(null);
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
        <small>{hi ? "वितरक असाइनमेंट" : "DISTRIBUTOR ASSIGNMENT"}</small>
        <h2>{hi ? "रतन → नीरज" : "Ratan → Neeraj"}</h2>
      </div>
      <p>
        {hi
          ? "M/s Ratan Products & Traders के सभी 10 सक्रिय वितरकों को एकमात्र सक्रिय सेल्स एग्जीक्यूटिव को एक क्लिक में असाइन करता है। पहले से मौजूद कोई भी असाइनमेंट डुप्लिकेट नहीं होगी।"
          : "Assigns all 10 active Distributors under M/s Ratan Products & Traders to the sole active Sales Executive, in one click. Any assignment that already exists is left untouched — safe to run more than once."}
      </p>
      <button
        type="button"
        className={styles.primaryBig}
        disabled={busy}
        onClick={() => {
          setBusy(true);
          setError(null);
          void post("bulk-assign-ratan-distributors", {})
            .then((r: Result) => setResult(r))
            .catch((err) => setError(err instanceof Error ? err.message : "Could not run bulk assignment"))
            .finally(() => setBusy(false));
        }}
      >
        {busy ? (hi ? "चल रहा है…" : "RUNNING…") : hi ? "10 वितरक असाइन करें" : "ASSIGN ALL 10 RATAN DISTRIBUTORS TO NEERAJ"}
      </button>
      {error && (
        <p role="status" data-ok={false} className={styles.cardError}>
          {error}
        </p>
      )}
    </section>
  );
}
