"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import styles from "./WorkflowActions.module.css";
import { EmptyOptionHint } from "./EmptyOptionHint";

type Option = { value: string; label: string };
type Assignment = {
  id: string;
  executiveId: string;
  executiveName: string;
  distributorId: string;
  distributorLabel: string;
  effectiveFrom: string;
  reason: string;
};

async function send(body: unknown) {
  const response = await fetch("/api/manager/operations", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result?.error?.message ?? result?.error?.code ?? "Action failed");
  return result;
}

// Closes the Start Day "Choose Working Distributor" cold-start gap (Founder-reported production
// issue): a brand-new Executive/territory has zero retailers yet, so executiveAuthorizedDistributors
// (scope.ts) had no way to bootstrap the first Distributor. This is the missing capability's UI,
// mirroring FieldForceAssignmentPanel's exact pattern — Founder/Admin -> Field force -> Assign
// Distributor. Unlike the Manager assignment (1:1, closes out priors), an Executive can legitimately
// work multiple Distributors' markets, so this only adds/removes individual links.
export function AssignDistributorToExecutivePanel({
  language,
  executives,
  distributors,
  assignments,
}: {
  language: "EN" | "HI";
  executives: Option[];
  distributors: Option[];
  assignments: Assignment[];
}) {
  const hi = language === "HI",
    router = useRouter(),
    [open, setOpen] = useState(false),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  return (
    <section className={styles.panel}>
      <div>
        <small>{hi ? "फील्ड फोर्स — वितरक क्षेत्र" : "FIELD FORCE — DISTRIBUTOR SCOPE"}</small>
        <h2>{hi ? "वितरक असाइन करें" : "Assign Distributor"}</h2>
      </div>
      {!open ? (
        <button type="button" className={styles.primaryBig} onClick={() => setOpen(true)} style={{ gridColumn: "2" }}>
          {hi ? "+ वितरक असाइन करें" : "+ ASSIGN DISTRIBUTOR"}
        </button>
      ) : (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            setBusy(true);
            setMessage(null);
            void send({
              action: "assign-distributor-to-executive",
              payload: {
                executiveId: String(f.get("executiveId")),
                distributorId: String(f.get("distributorId")),
                reason: String(f.get("reason")),
              },
            })
              .then(() => {
                setMessage({ ok: true, text: hi ? "असाइनमेंट सहेजा गया।" : "Assignment saved." });
                setOpen(false);
                router.refresh();
              })
              .catch((err) => setMessage({ ok: false, text: err instanceof Error ? err.message : "Could not save assignment" }))
              .finally(() => setBusy(false));
          }}
        >
          <label>
            {hi ? "सेल्स एग्जीक्यूटिव" : "Sales Executive"}
            <select name="executiveId" required>
              <option value="">{hi ? "नाम से चुनें" : "Choose by name"}</option>
              {executives.map((x) => (
                <option key={x.value} value={x.value}>{x.label}</option>
              ))}
            </select>
          </label>
          {!executives.length && <EmptyOptionHint language={language} fallback={hi ? "पहले SALES_EXECUTIVE भूमिका वाला उपयोगकर्ता बनाएं।" : "Create a user with the SALES_EXECUTIVE role first."} />}
          <label>
            {hi ? "वितरक (Firm — Town)" : "Distributor (Firm — Town)"}
            <select name="distributorId" required>
              <option value="">{hi ? "नाम से चुनें" : "Choose by name"}</option>
              {distributors.map((x) => (
                <option key={x.value} value={x.value}>{x.label}</option>
              ))}
            </select>
          </label>
          {!distributors.length && <EmptyOptionHint language={language} fallback={hi ? "पहले सक्रिय वितरक बनाएं।" : "Create an active Distributor first."} />}
          <label>
            {hi ? "कारण" : "Reason"}
            <input name="reason" required minLength={3} placeholder={hi ? "जैसे नया क्षेत्र असाइनमेंट" : "e.g. New territory assignment"} />
          </label>
          <button disabled={busy || !executives.length || !distributors.length} className={styles.primaryBig}>
            {hi ? "सहेजें" : "SAVE ASSIGNMENT"}
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
      <div className={styles.list} style={{ gridColumn: "1/-1" }}>
        <strong>{hi ? "वर्तमान असाइनमेंट" : "Current assignments"}</strong>
        {!assignments.length && <EmptyOptionHint language={language} fallback={hi ? "अभी तक कोई असाइनमेंट नहीं।" : "No assignments yet."} />}
        <ul className={styles.list}>
          {assignments.map((a) => (
            <li key={a.id}>
              <p>
                <strong>{a.executiveName}</strong> {hi ? "के लिए" : "→"} <strong>{a.distributorLabel}</strong>
              </p>
              <p>
                {hi ? "प्रभावी" : "Effective"} {new Date(a.effectiveFrom).toLocaleDateString(hi ? "hi-IN" : "en-IN")} · {a.reason}
              </p>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
