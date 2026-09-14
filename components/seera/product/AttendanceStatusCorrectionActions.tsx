"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import styles from "./WorkflowActions.module.css";

const STATUSES = ["PRESENT", "LATE", "ABSENT", "ON_LEAVE", "WEEK_OFF", "EXCEPTION"] as const;

async function post(action: string, payload: unknown) {
  const r = await fetch("/api/manager/operations", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, payload }) });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d?.error?.message ?? d?.error?.code ?? "Action failed");
  return d;
}

// Attendance Intelligence add-on. Deliberately named distinctly from the pre-existing
// AttendanceCorrectionActions.tsx (which corrects a raw SeeraWorkSession's fields via the
// "correct-attendance" action) — this corrects the new, decided SeeraAttendanceRecord status
// (Present/Late/Absent/On Leave/Week Off/Exception) via "correct-attendance-record". Both stay;
// neither replaces the other. correctAttendanceRecord (attendance-service.ts) requires
// network:manage and a non-empty reason, and records full before/after history via recordAudit —
// this never silently overwrites what the system or a prior human decided, it adds a new, audited
// decision on top (see the Audit history section rendered above this form).
export function AttendanceStatusCorrectionActions({ employeeId, date, currentStatus }: { employeeId: string; date: string; currentStatus: string | null }) {
  const router = useRouter();
  const [status, setStatus] = useState(currentStatus ?? "PRESENT");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  return (
    <form
      className={styles.list}
      onSubmit={(e) => {
        e.preventDefault();
        if (reason.trim().length < 3) {
          setMessage({ ok: false, text: "Enter a reason (at least 3 characters) for this correction." });
          return;
        }
        setBusy(true);
        setMessage(null);
        void post("correct-attendance-record", { employeeId, date, status, reason })
          .then(() => {
            setMessage({ ok: true, text: "Attendance updated." });
            setReason("");
            router.refresh();
          })
          .catch((err) => setMessage({ ok: false, text: err instanceof Error ? err.message : "Could not update attendance." }))
          .finally(() => setBusy(false));
      }}
    >
      <label>
        Status
        <select value={status} onChange={(e) => setStatus(e.target.value)}>
          {STATUSES.map((s) => (
            <option key={s} value={s}>{s.replaceAll("_", " ")}</option>
          ))}
        </select>
      </label>
      <label>
        Reason for correction
        <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Worked offline / approved correction" />
      </label>
      <button type="submit" className={styles.primary} disabled={busy}>
        {busy ? "Saving…" : "Save correction"}
      </button>
      {message && <p role="status" data-ok={message.ok}>{message.text}</p>}
    </form>
  );
}
