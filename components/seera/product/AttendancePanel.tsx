import Link from "next/link";
import type { founderAttendanceSummary, founderAttendanceMonthKpis } from "@/lib/sales-distribution/attendance-service";
import { LeaveManagementActions } from "./LeaveManagementActions";

// Attendance Intelligence add-on — replaces the generic SeeraWorkSession list that both
// founder-admin's and sales-manager's "Attendance" nav items previously fell through to (a raw
// role+workingType+status+date row, with zero notion of Present/Late/Absent) with a real business
// view over the new SeeraAttendanceRecord layer. Same underlying employees/sessions, just a
// decided status instead of a re-labeled session dump.

const STATUS_LABEL: Record<string, { label: string; tone: string }> = {
  PRESENT: { label: "Present", tone: "success" },
  LATE: { label: "Late", tone: "warning" },
  ABSENT: { label: "Absent", tone: "danger" },
  ON_LEAVE: { label: "On Leave", tone: "info" },
  WEEK_OFF: { label: "Week Off", tone: "analytical" },
  HOLIDAY: { label: "Holiday", tone: "info" },
  EXCEPTION: { label: "Exception", tone: "warning" },
};

export function AttendancePanel({
  base,
  data,
  monthKpis,
  leave,
}: {
  base: string;
  data: Awaited<ReturnType<typeof founderAttendanceSummary>>;
  monthKpis?: Awaited<ReturnType<typeof founderAttendanceMonthKpis>>;
  leave?: { employees: { id: string; name: string }[]; pending: { id: string; employeeId: string; employeeName: string; startDate: string; endDate: string; reason: string }[] };
}) {
  const dateLabel = new Date(data.businessDate).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
  const monthLabel = new Date(data.businessDate).toLocaleDateString("en-IN", { month: "long", year: "numeric" });
  return (
    <div style={{ display: "grid", gap: 16 }}>
      <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
        <strong>Today's Attendance — {dateLabel}</strong>
        <Link href={`${base}?view=monthly`} style={{ fontWeight: 800, fontSize: 13, color: "#b91c1c", textDecoration: "none" }}>
          Monthly Attendance →
        </Link>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(130px, 1fr))", gap: 10 }}>
        <Kpi label="TOTAL EMPLOYEES" value={data.kpis.total} />
        <Kpi label="PRESENT" value={data.kpis.present} tone="success" />
        <Kpi label="LATE" value={data.kpis.late} tone="warning" />
        <Kpi label="ABSENT" value={data.kpis.absent} tone="danger" />
        <Kpi label="ON LEAVE" value={data.kpis.onLeave} tone="info" />
        <Kpi label="WEEK OFF" value={data.kpis.weekOff} tone="analytical" />
        <Kpi label="HOLIDAY" value={data.kpis.holiday} tone="info" />
        <Kpi label="EXCEPTIONS" value={data.kpis.exception} tone="warning" />
        {data.kpis.notEvaluated > 0 && <Kpi label="NOT YET EVALUATED" value={data.kpis.notEvaluated} />}
      </div>

      {monthKpis && (
        <div style={card}>
          <strong style={{ fontSize: 13 }}>Month so far — {monthLabel}</strong>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(110px, 1fr))", gap: 10, marginTop: 10 }}>
            <Kpi label="PRESENT" value={monthKpis.present} tone="success" />
            <Kpi label="ABSENT" value={monthKpis.absent} tone="danger" />
            <Kpi label="LATE" value={monthKpis.late} tone="warning" />
            <Kpi label="ON LEAVE" value={monthKpis.onLeave} tone="info" />
            <Kpi label="WEEK OFF" value={monthKpis.weekOff} tone="analytical" />
            <Kpi label="HOLIDAY" value={monthKpis.holiday} tone="info" />
            <Kpi label="SUNDAY WORKED" value={monthKpis.sundayWorked} tone="success" />
          </div>
        </div>
      )}

      {leave && <LeaveManagementActions employees={leave.employees} pending={leave.pending} />}

      {data.attention.length > 0 && (
        <div style={card}>
          <strong>Attendance Attention</strong>
          <p style={{ margin: "4px 0 12px", color: "#64748b", fontSize: 13 }}>
            {data.attention.length} employee{data.attention.length === 1 ? "" : "s"} need review today.
          </p>
          <div style={{ display: "grid", gap: 10 }}>
            {data.attention.map((row) => (
              <AttendanceRow key={row.employeeId} base={base} row={row} />
            ))}
          </div>
        </div>
      )}

      <div style={card}>
        <strong>All employees</strong>
        <div style={{ display: "grid", gap: 10, marginTop: 10 }}>
          {data.rows.map((row) => (
            <AttendanceRow key={row.employeeId} base={base} row={row} />
          ))}
        </div>
      </div>
    </div>
  );
}

function AttendanceRow({ base, row }: { base: string; row: Awaited<ReturnType<typeof founderAttendanceSummary>>["rows"][number] }) {
  const status = row.status ? STATUS_LABEL[row.status] : null;
  return (
    <div style={rowCard}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
        <div>
          <strong>{row.name}</strong>
          <div style={{ fontSize: 12, color: "#94a3b8" }}>{row.roleLabel}</div>
        </div>
        <span style={pill(status?.tone)}>
          {status?.label ?? "Not evaluated"}
          {row.offDayWorked ? " *" : ""}
        </span>
      </div>
      <p style={{ margin: "6px 0 0", fontSize: 13, color: "#475569" }}>{row.reason}</p>
      {row.offDayWorked && (
        <p style={{ margin: "2px 0 0", fontSize: 11, fontWeight: 800, color: "#0369a1" }}>
          * {row.offDayWorked === "SUNDAY_WORKED" ? "Sunday Worked" : "Holiday Worked"}
        </p>
      )}
      {row.source && <p style={{ margin: "2px 0 0", fontSize: 11, color: "#94a3b8" }}>Source: {row.source === "SYSTEM" ? "System auto-marked" : "Manually corrected"}</p>}
      <div style={{ marginTop: 8 }}>
        <Link href={`${base}/${row.employeeId}`} style={{ fontWeight: 800, fontSize: 13, color: "#b91c1c", textDecoration: "none" }}>
          View details →
        </Link>
      </div>
    </div>
  );
}

function Kpi({ label, value, tone }: { label: string; value: number; tone?: string }) {
  return (
    <div style={{ padding: 12, borderRadius: 12, background: "#fff", border: "1px solid #e7e2d8", boxShadow: "0 1px 2px #17255408" }}>
      <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: "0.06em", color: "#94a3b8", textTransform: "uppercase" }}>{label}</div>
      <strong style={{ fontSize: 22, color: toneColor(tone) }}>{value}</strong>
    </div>
  );
}

function toneColor(tone?: string) {
  switch (tone) {
    case "success": return "#059669";
    case "warning": return "#b45309";
    case "danger": return "#dc2626";
    case "info": return "#0369a1";
    case "analytical": return "#6d28d9";
    default: return "#172033";
  }
}
function pill(tone?: string): React.CSSProperties {
  const bgByTone: Record<string, string> = { success: "#e7f7f0", warning: "#fdf2e0", danger: "#fdeaea", info: "#e6f3fb", analytical: "#f1eafb" };
  return {
    display: "inline-flex", padding: "3px 10px", borderRadius: 999, fontSize: 11, fontWeight: 800,
    background: tone ? bgByTone[tone] : "#f1f5f9", color: toneColor(tone),
  };
}
const card: React.CSSProperties = { padding: 16, borderRadius: 14, background: "#fff", border: "1px solid #e7e2d8", boxShadow: "0 1px 2px #17255408" };
const rowCard: React.CSSProperties = { padding: 12, borderRadius: 10, border: "1px solid #f0ece3", background: "#fffaf8" };
