import Link from "next/link";
import type { founderMonthlyAttendanceSheet } from "@/lib/sales-distribution/attendance-service";

// Attendance Intelligence add-on — Section 6's PRIMARY REQUIREMENT. Grid: employees (rows) ×
// calendar days (columns), sourced entirely from already-decided SeeraAttendanceRecord rows
// (founderMonthlyAttendanceSheet) — a day with no stored record renders "—" (not evaluated),
// never a guessed status. Sunday/Holiday-worked days get a visible "*" suffix, not color alone.

type SheetData = Awaited<ReturnType<typeof founderMonthlyAttendanceSheet>>;

const CODE_TITLE: Record<string, string> = {
  P: "Present", L: "Late", A: "Absent", LV: "On Leave", WO: "Week Off", H: "Holiday", EX: "Exception", "—": "Not evaluated",
};
const CODE_TONE: Record<string, string> = { P: "#059669", L: "#b45309", A: "#dc2626", LV: "#0369a1", WO: "#6d28d9", H: "#0369a1", EX: "#b45309", "—": "#cbd5e1" };

export function MonthlyAttendancePanel({ base, data, statusFilter }: { base: string; data: SheetData; statusFilter?: string }) {
  const monthLabel = new Date(Date.UTC(data.year, data.month - 1, 1)).toLocaleDateString("en-IN", { month: "long", year: "numeric" });
  const prevMonth = data.month === 1 ? { year: data.year - 1, month: 12 } : { year: data.year, month: data.month - 1 };
  const nextMonth = data.month === 12 ? { year: data.year + 1, month: 1 } : { year: data.year, month: data.month + 1 };
  const statusOptions = ["PRESENT", "LATE", "ABSENT", "ON_LEAVE", "WEEK_OFF", "HOLIDAY", "EXCEPTION"];

  return (
    <div style={{ display: "grid", gap: 16 }}>
      <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <Link href={`${base}?view=monthly&year=${prevMonth.year}&month=${prevMonth.month}`} style={navBtn}>← Prev</Link>
          <strong style={{ fontSize: 16 }}>Monthly Attendance — {monthLabel}</strong>
          <Link href={`${base}?view=monthly&year=${nextMonth.year}&month=${nextMonth.month}`} style={navBtn}>Next →</Link>
        </div>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <form method="get" style={{ display: "flex", gap: 6 }}>
            <input type="hidden" name="view" value="monthly" />
            <select name="year" defaultValue={data.year}>
              {[data.year - 1, data.year, data.year + 1].map((y) => <option key={y} value={y}>{y}</option>)}
            </select>
            <select name="month" defaultValue={data.month}>
              {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
                <option key={m} value={m}>{new Date(Date.UTC(2000, m - 1, 1)).toLocaleDateString("en-IN", { month: "short" })}</option>
              ))}
            </select>
            <select name="status" defaultValue={statusFilter ?? ""}>
              <option value="">All statuses</option>
              {statusOptions.map((s) => <option key={s} value={s}>{s.replaceAll("_", " ")}</option>)}
            </select>
            <button type="submit" style={navBtn}>Go</button>
          </form>
          <a href={`/api/attendance/export?year=${data.year}&month=${data.month}`} style={{ ...navBtn, background: "#b91c1c", color: "#fff", borderColor: "#b91c1c" }}>
            ⬇ Export Monthly Attendance
          </a>
          <Link href={base} style={navBtn}>Today view</Link>
        </div>
      </div>

      <p style={{ fontSize: 12, color: "#94a3b8" }}>
        Legend: P Present · L Late · A Absent · LV Leave · WO Week Off · H Holiday · EX Exception · — Not evaluated ·{" "}
        <strong>*</strong> = worked on Sunday/Holiday. Click a code for details; click an employee name for their full month summary.
      </p>

      <div style={{ overflowX: "auto", border: "1px solid #e7e2d8", borderRadius: 14, background: "#fff" }}>
        <table style={{ borderCollapse: "collapse", fontSize: 12, minWidth: 900 }}>
          <thead>
            <tr>
              <th style={{ ...thStyle, position: "sticky", left: 0, background: "#f8fafc", zIndex: 1, minWidth: 160, textAlign: "left" }}>Employee</th>
              {Array.from({ length: data.daysInMonth }, (_, i) => (
                <th key={i} style={{ ...thStyle, minWidth: 28 }}>{i + 1}</th>
              ))}
              <th style={thStyle}>P</th>
              <th style={thStyle}>A</th>
              <th style={thStyle}>L</th>
              <th style={thStyle}>LV</th>
              <th style={thStyle}>WO</th>
              <th style={thStyle}>H</th>
              <th style={thStyle}>Sun. Wkd</th>
            </tr>
          </thead>
          <tbody>
            {data.rows.map((row) => (
              <tr key={row.employeeId}>
                <td style={{ ...tdStyle, position: "sticky", left: 0, background: "#fff", textAlign: "left", fontWeight: 800 }}>
                  <Link href={`${base}/${row.employeeId}?year=${data.year}&month=${data.month}`} style={{ color: "#172033", textDecoration: "none" }}>
                    {row.name}
                  </Link>
                  <div style={{ fontWeight: 400, color: "#94a3b8", fontSize: 11 }}>{row.roleLabel}</div>
                </td>
                {row.days.map((d) => (
                  <td key={d.day} style={{ ...tdStyle, color: CODE_TONE[d.code] ?? "#172033", fontWeight: 800 }} title={d.reason ?? CODE_TITLE[d.code]}>
                    {d.offDayWorked ? (
                      <Link href={`${base}/${row.employeeId}?year=${data.year}&month=${data.month}&day=${d.day}`} style={{ color: "inherit", textDecoration: "none" }}>
                        {d.code}*
                      </Link>
                    ) : d.status ? (
                      <Link href={`${base}/${row.employeeId}?year=${data.year}&month=${data.month}&day=${d.day}`} style={{ color: "inherit", textDecoration: "none" }}>
                        {d.code}
                      </Link>
                    ) : (
                      d.code
                    )}
                  </td>
                ))}
                <td style={tdStyle}>{row.totals.present}</td>
                <td style={tdStyle}>{row.totals.absent}</td>
                <td style={tdStyle}>{row.totals.late}</td>
                <td style={tdStyle}>{row.totals.onLeave}</td>
                <td style={tdStyle}>{row.totals.weekOff}</td>
                <td style={tdStyle}>{row.totals.holiday}</td>
                <td style={tdStyle}>{row.totals.sundayWorked}</td>
              </tr>
            ))}
            {data.rows.length === 0 && (
              <tr><td style={tdStyle} colSpan={data.daysInMonth + 8}>No employees match this filter.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

const navBtn: React.CSSProperties = { display: "inline-flex", alignItems: "center", minHeight: 36, padding: "0 12px", borderRadius: 8, border: "1px solid #cbd5e1", background: "#fff", color: "#172033", fontWeight: 800, fontSize: 12, textDecoration: "none", cursor: "pointer" };
const thStyle: React.CSSProperties = { padding: "8px 6px", borderBottom: "1px solid #e7e2d8", background: "#f8fafc", fontSize: 10, fontWeight: 800, color: "#94a3b8", textTransform: "uppercase", textAlign: "center" };
const tdStyle: React.CSSProperties = { padding: "8px 6px", borderBottom: "1px solid #f0ece3", textAlign: "center", whiteSpace: "nowrap" };
