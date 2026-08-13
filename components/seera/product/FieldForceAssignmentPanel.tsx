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
  managerId: string;
  managerName: string;
  effectiveFrom: string;
  reason: string;
};

async function send(body: unknown) {
  const response = await fetch("/api/manager/operations", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result?.error?.message ?? result?.error?.code ?? "Action failed");
  return result;
}

// Founder UAT fix (P0 cluster): Beat Planner's Executive selector, Manager Distributor Oversight's
// dropdown, and Manager Retailing's selector were all empty for a real Manager with a real
// SALES_EXECUTIVE teammate — every one of them reads the SAME canonical "who reports to whom" link
// (SeeraAssignment{MANAGER_TEAM}), which until this pass no application code could ever create. This
// is that missing capability's UI: Founder/Admin → Field force → Assign Manager.
export function FieldForceAssignmentPanel({
  language,
  executives,
  managers,
  assignments,
}: {
  language: "EN" | "HI";
  executives: Option[];
  managers: Option[];
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
        <small>{hi ? "फील्ड फोर्स पदानुक्रम" : "FIELD FORCE HIERARCHY"}</small>
        <h2>{hi ? "मैनेजर असाइन करें" : "Assign Manager"}</h2>
      </div>
      {!open ? (
        <button type="button" className={styles.primaryBig} onClick={() => setOpen(true)} style={{ gridColumn: "2" }}>
          {hi ? "+ मैनेजर असाइन करें" : "+ ASSIGN MANAGER"}
        </button>
      ) : (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            setBusy(true);
            setMessage(null);
            void send({
              action: "assign-manager-team",
              payload: {
                executiveId: String(f.get("executiveId")),
                managerId: String(f.get("managerId")),
                effectiveFrom: String(f.get("effectiveFrom")),
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
            {hi ? "रिपोर्ट करेगा" : "Reports to Manager"}
            <select name="managerId" required>
              <option value="">{hi ? "नाम से चुनें" : "Choose by name"}</option>
              {managers.map((x) => (
                <option key={x.value} value={x.value}>{x.label}</option>
              ))}
            </select>
          </label>
          {!managers.length && <EmptyOptionHint language={language} fallback={hi ? "पहले SALES_MANAGER भूमिका वाला उपयोगकर्ता बनाएं।" : "Create a user with the SALES_MANAGER role first."} />}
          <label>
            {hi ? "प्रभावी तिथि" : "Effective from"}
            <input name="effectiveFrom" type="date" required defaultValue={new Date().toISOString().slice(0, 10)} />
          </label>
          <label>
            {hi ? "कारण" : "Reason"}
            <input name="reason" required minLength={3} placeholder={hi ? "जैसे नई नियुक्ति" : "e.g. New hire onboarding"} />
          </label>
          <button disabled={busy || !executives.length || !managers.length} className={styles.primaryBig}>
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
                <strong>{a.executiveName}</strong> {hi ? "रिपोर्ट करता है" : "reports to"} <strong>{a.managerName}</strong>
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
