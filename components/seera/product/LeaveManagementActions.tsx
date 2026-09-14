"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

type LeaveRow = { id: string; employeeId: string; employeeName: string; startDate: string; endDate: string; reason: string };

async function post(action: string, payload: unknown) {
  const r = await fetch("/api/manager/operations", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, payload }) });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d?.error?.message ?? d?.error?.code ?? "Action failed");
  return d;
}

const inputStyle: React.CSSProperties = { minHeight: 44, padding: "8px 10px", border: "1px solid #cbd5e1", borderRadius: 9, background: "#fff", font: "inherit" };
const labelStyle: React.CSSProperties = { display: "grid", gap: 5, fontSize: 12, fontWeight: 800, color: "#475569" };
const card: React.CSSProperties = { padding: 16, borderRadius: 14, background: "#fff", border: "1px solid #e7e2d8", boxShadow: "0 1px 2px #17255408" };

// Attendance Intelligence add-on — Section 4's "minimum governed structure" leave UI. Approve/
// Reject are the only decisions; a PENDING row never affects attendance until acted on here.
export function LeaveManagementActions({ employees, pending }: { employees: { id: string; name: string }[]; pending: LeaveRow[] }) {
  const router = useRouter();
  const [employeeId, setEmployeeId] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  const submitRequest = () => {
    if (!employeeId || !startDate || !endDate || reason.trim().length < 3) {
      setMessage({ ok: false, text: "Choose an employee, both dates, and a reason (at least 3 characters)." });
      return;
    }
    setBusy("new");
    setMessage(null);
    void post("create-leave-request", { employeeId, startDate, endDate, reason })
      .then(() => {
        setMessage({ ok: true, text: "Leave request recorded (pending)." });
        setEmployeeId(""); setStartDate(""); setEndDate(""); setReason("");
        router.refresh();
      })
      .catch((err) => setMessage({ ok: false, text: err instanceof Error ? err.message : "Could not record leave." }))
      .finally(() => setBusy(null));
  };

  const decide = (id: string, status: "APPROVED" | "REJECTED") => {
    setBusy(id);
    setMessage(null);
    void post("decide-leave-request", { id, status })
      .then(() => { setMessage({ ok: true, text: `Leave ${status === "APPROVED" ? "approved" : "rejected"}.` }); router.refresh(); })
      .catch((err) => setMessage({ ok: false, text: err instanceof Error ? err.message : "Could not decide leave." }))
      .finally(() => setBusy(null));
  };

  return (
    <div style={{ ...card, display: "grid", gap: 14 }}>
      <strong>Leave requests</strong>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 10 }}>
        <label style={labelStyle}>
          Employee
          <select style={inputStyle} value={employeeId} onChange={(e) => setEmployeeId(e.target.value)}>
            <option value="">Choose…</option>
            {employees.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
          </select>
        </label>
        <label style={labelStyle}>From<input style={inputStyle} type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} /></label>
        <label style={labelStyle}>To<input style={inputStyle} type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} /></label>
        <label style={labelStyle}>Reason<input style={inputStyle} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Family function" /></label>
      </div>
      <button
        type="button"
        disabled={busy === "new"}
        onClick={submitRequest}
        style={{ minHeight: 44, border: 0, borderRadius: 9, background: "#177245", color: "#fff", fontWeight: 850, cursor: "pointer", justifySelf: "start", padding: "0 20px" }}
      >
        {busy === "new" ? "Saving…" : "Record leave request"}
      </button>

      <div>
        <strong style={{ fontSize: 13 }}>Pending ({pending.length})</strong>
        {pending.length === 0 ? (
          <p style={{ color: "#94a3b8", fontSize: 13 }}>No pending leave requests.</p>
        ) : (
          <div style={{ display: "grid", gap: 10, marginTop: 8 }}>
            {pending.map((p) => (
              <div key={p.id} style={{ padding: 12, borderRadius: 10, border: "1px solid #f0ece3", background: "#fffaf8" }}>
                <strong>{p.employeeName}</strong>
                <p style={{ margin: "4px 0", fontSize: 13, color: "#475569" }}>
                  {new Date(p.startDate).toLocaleDateString("en-IN")} → {new Date(p.endDate).toLocaleDateString("en-IN")} — {p.reason}
                </p>
                <div style={{ display: "flex", gap: 8 }}>
                  <button
                    type="button"
                    disabled={busy === p.id}
                    onClick={() => decide(p.id, "APPROVED")}
                    style={{ minHeight: 36, padding: "0 14px", border: 0, borderRadius: 8, background: "#177245", color: "#fff", fontWeight: 800, cursor: "pointer" }}
                  >
                    Approve
                  </button>
                  <button
                    type="button"
                    disabled={busy === p.id}
                    onClick={() => decide(p.id, "REJECTED")}
                    style={{ minHeight: 36, padding: "0 14px", border: "1px solid #ead8d2", borderRadius: 8, background: "#fff", color: "#b4232d", fontWeight: 800, cursor: "pointer" }}
                  >
                    Reject
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {message && (
        <p style={{ margin: 0, padding: 10, borderRadius: 8, background: message.ok ? "#f2fbf6" : "#fff5f5", color: message.ok ? "#177245" : "#b4232d", fontSize: 13, fontWeight: 700 }}>
          {message.text}
        </p>
      )}
    </div>
  );
}
