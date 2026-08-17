"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import styles from "./WorkflowActions.module.css";

type Row = { distributorId: string; distributorLabel: string; status: "CREATED" | "ALREADY_EXISTED" };
type Result = {
  managerName: string;
  executiveName: string;
  distributorsCreated: number;
  distributorsAlreadyExisted: number;
  distributorResults: Row[];
};

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

// Founder-authorized, ONE-TIME composed action replacing two separate clicks (Assign Manager +
// Ratan bulk-assign) with one, for the current unambiguous state: exactly one active Sales
// Manager, one active Sales Executive. Calls completeSoleExecutiveFieldForceSetup, which itself
// only composes the two already-governed primitives — no new write path. Auto-hides once both the
// Manager assignment and all 10 Distributor assignments already exist (OperationalWorkspace only
// renders this while that's not yet true).
export function CompleteFieldForceSetupPanel({ language }: { language: "EN" | "HI" }) {
  const hi = language === "HI",
    router = useRouter(),
    [busy, setBusy] = useState(false),
    [result, setResult] = useState<Result | null>(null),
    [error, setError] = useState<string | null>(null);

  if (result) {
    return (
      <section className={styles.panel}>
        <div>
          <small>{hi ? "फील्ड फोर्स सेटअप" : "FIELD FORCE SETUP"}</small>
          <h2>{hi ? "पूर्ण" : "Complete"}</h2>
        </div>
        <p role="status">
          {result.managerName} → {result.executiveName}: {hi ? "मैनेजर असाइनमेंट सुनिश्चित" : "manager assignment ensured"}. {result.distributorsCreated} {hi ? "वितरक नए असाइन किए गए" : "distributors newly assigned"}, {result.distributorsAlreadyExisted} {hi ? "पहले से मौजूद थे" : "already existed"}.
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
              {result.distributorResults.map((r) => (
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
        <small>{hi ? "फील्ड फोर्स सेटअप" : "FIELD FORCE SETUP"}</small>
        <h2>{hi ? "नीरज का सेटअप पूरा करें" : "Complete Neeraj's Field Force Setup"}</h2>
      </div>
      <p>
        {hi
          ? "एक क्लिक में: Awdhesh → Neeraj मैनेजर असाइनमेंट सुनिश्चित करता है, और सभी 10 रतन वितरकों को Neeraj को असाइन करता है। दोबारा चलाना सुरक्षित है — कोई डुप्लिकेट नहीं बनेगा।"
          : "One click: ensures the Awdhesh → Neeraj manager assignment, and assigns all 10 Ratan distributors to Neeraj. Safe to run more than once — creates no duplicates."}
      </p>
      <button
        type="button"
        className={styles.primaryBig}
        disabled={busy}
        onClick={() => {
          setBusy(true);
          setError(null);
          void post("complete-sole-executive-field-force-setup", {})
            .then((r: Result) => setResult(r))
            .catch((err) => setError(err instanceof Error ? err.message : "Could not complete setup"))
            .finally(() => setBusy(false));
        }}
      >
        {busy ? (hi ? "चल रहा है…" : "RUNNING…") : hi ? "सेटअप पूरा करें" : "COMPLETE NEERAJ FIELD FORCE SETUP"}
      </button>
      {error && (
        <p role="status" data-ok={false} className={styles.cardError}>
          {error}
        </p>
      )}
    </section>
  );
}
