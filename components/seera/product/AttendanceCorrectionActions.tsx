"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import styles from "./WorkflowActions.module.css";
import { EmptyOptionHint } from "./EmptyOptionHint";

type Session = {
  value: string;
  label: string;
  employeeName: string;
  date: string;
  status: string;
  startedAt: string;
  endedAt: string | null;
  startGps: boolean;
  endGps: boolean;
  activityCount: number;
  alreadyCorrected: boolean;
};

export function AttendanceCorrectionActions({
  language,
  sessions,
}: {
  language: "EN" | "HI";
  sessions: Session[];
}) {
  const hi = language === "HI",
    router = useRouter(),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState(""),
    [selectedId, setSelectedId] = useState("");
  const selected = sessions.find((s) => s.value === selectedId);
  return (
    <section className={styles.panel}>
      <div>
        <small>{hi ? "उपस्थिति सुधार" : "ATTENDANCE CORRECTION"}</small>
        <h2>{hi ? "कार्य दिवस रिकॉर्ड ठीक करें" : "Correct a field work-day record"}</h2>
      </div>
      <label style={{ gridColumn: "1/-1" }}>
        {hi ? "कार्य दिवस" : "Work day"}
        <select value={selectedId} onChange={(e) => setSelectedId(e.target.value)} required>
          <option value="">{hi ? "दिन चुनें" : "Choose a day"}</option>
          {sessions.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
        </select>
      </label>
      {!sessions.length && <EmptyOptionHint language={language} fallback={hi ? "आपकी टीम के लिए कोई कार्य दिवस दर्ज नहीं है।" : "No work days recorded for your team yet."} />}
      {selected && (
        <dl className={styles.list} style={{ gridColumn: "1/-1", display: "grid", gridTemplateColumns: "repeat(2,minmax(0,1fr))", gap: 8 }}>
          <div><dt>{hi ? "कर्मचारी" : "Employee"}</dt><dd>{selected.employeeName}</dd></div>
          <div><dt>{hi ? "वर्तमान स्थिति" : "Current status"}</dt><dd>{selected.status}</dd></div>
          <div><dt>{hi ? "प्रारंभ" : "Start"}</dt><dd>{new Date(selected.startedAt).toLocaleString(hi ? "hi-IN" : "en-IN")} · GPS {selected.startGps ? "✓" : "✗"}</dd></div>
          <div><dt>{hi ? "समाप्ति" : "End"}</dt><dd>{selected.endedAt ? `${new Date(selected.endedAt).toLocaleString(hi ? "hi-IN" : "en-IN")} · GPS ${selected.endGps ? "✓" : "✗"}` : "—"}</dd></div>
          <div><dt>{hi ? "गतिविधि गणना" : "Activity count"}</dt><dd>{selected.activityCount}</dd></div>
          <div><dt>{hi ? "सुधार स्थिति" : "Correction status"}</dt><dd>{selected.alreadyCorrected ? (hi ? "पहले सुधारा गया" : "Previously corrected") : hi ? "कोई सुधार नहीं" : "No correction yet"}</dd></div>
        </dl>
      )}
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setMessage("");
          try {
            const f = new FormData(e.currentTarget);
            const status = String(f.get("status") || "");
            const endedAt = String(f.get("endedAt") || "");
            const outcome = String(f.get("outcome") || "");
            const remarks = String(f.get("remarks") || "");
            const response = await fetch("/api/manager/operations", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                action: "correct-attendance",
                payload: {
                  workSessionId: selectedId,
                  status: status || undefined,
                  endedAt: endedAt ? new Date(endedAt).toISOString() : undefined,
                  outcome: outcome || undefined,
                  remarks: remarks || undefined,
                  reason: String(f.get("reason")),
                },
              }),
            });
            const data = await response.json().catch(() => ({}));
            if (!response.ok)
              throw new Error(data?.error?.message ?? data?.error?.code ?? "Correction failed");
            setMessage(hi ? "उपस्थिति सुधारी गई।" : "Attendance corrected.");
            router.refresh();
          } catch (error) {
            setMessage(error instanceof Error ? error.message : "Correction failed");
          } finally {
            setBusy(false);
          }
        }}
      >
        <label>
          {hi ? "स्थिति (वैकल्पिक)" : "Status (optional)"}
          <select name="status" defaultValue="">
            <option value="">{hi ? "अपरिवर्तित" : "Unchanged"}</option>
            <option value="ACTIVE">ACTIVE</option>
            <option value="ENDED">ENDED</option>
            <option value="CANCELLED">CANCELLED</option>
          </select>
        </label>
        <label>
          {hi ? "समाप्ति समय (वैकल्पिक)" : "End time (optional)"}
          <input name="endedAt" type="datetime-local" />
        </label>
        <label>
          {hi ? "परिणाम (वैकल्पिक)" : "Outcome (optional)"}
          <input name="outcome" />
        </label>
        <label>
          {hi ? "टिप्पणी (वैकल्पिक)" : "Remarks (optional)"}
          <input name="remarks" />
        </label>
        <label>
          {hi ? "सुधार का कारण" : "Reason for correction"}
          <input name="reason" minLength={3} required />
        </label>
        <button disabled={busy || !selectedId}>
          {hi ? "सुधार सहेजें" : "Save correction"}
        </button>
      </form>
      {message && <p role="status">{message}</p>}
    </section>
  );
}
