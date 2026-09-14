import { NextResponse } from "next/server";
import ExcelJS from "exceljs";
import { prisma } from "@/lib/database/client";
import { resolveRequestIdentity } from "@/lib/foundation/request-auth";
import { apiFailure } from "@/lib/foundation/api-response";
import {
  founderMonthlyAttendanceSheet,
  bulkEmployeeMonthlyPerformance,
  bulkMonthlyActivityTimelines,
} from "@/lib/sales-distribution/attendance-service";

const DAY_LABEL: Record<string, string> = { PRESENT: "P", LATE: "L", ABSENT: "A", ON_LEAVE: "LV", WEEK_OFF: "WO", HOLIDAY: "H", EXCEPTION: "EX" };

// Attendance Intelligence add-on — Section 10's "professional spreadsheet" export. Real multi-sheet
// .xlsx (exceljs, newly added dependency — no spreadsheet library existed in this codebase before).
// Every cell is sourced from the SAME functions the Founder UI itself calls
// (founderMonthlyAttendanceSheet / employeeMonthlyPerformance / dailyActivityTimeline) — no second
// calculation path, and only fields those functions actually return; nothing here is invented.
export async function GET(request: Request) {
  try {
    const { user } = await resolveRequestIdentity();
    const url = new URL(request.url);
    const year = Number(url.searchParams.get("year")) || new Date().getFullYear();
    const month = Number(url.searchParams.get("month")) || new Date().getMonth() + 1;

    const sheet = await founderMonthlyAttendanceSheet(prisma, user.id, { year, month });
    const workbook = new ExcelJS.Workbook();
    workbook.creator = "Seera Sales & Distribution OS";
    workbook.created = new Date();

    // SHEET 1 — Monthly Attendance
    const s1 = workbook.addWorksheet("Monthly Attendance");
    s1.columns = [
      { header: "Employee", key: "employee", width: 26 },
      { header: "Role", key: "role", width: 16 },
      ...Array.from({ length: sheet.daysInMonth }, (_, i) => ({ header: String(i + 1), key: `d${i + 1}`, width: 4 })),
      { header: "Present", key: "present", width: 9 },
      { header: "Late", key: "late", width: 7 },
      { header: "Absent", key: "absent", width: 8 },
      { header: "Leave", key: "onLeave", width: 8 },
      { header: "Week Off", key: "weekOff", width: 9 },
      { header: "Holiday", key: "holiday", width: 8 },
      { header: "Sunday Worked", key: "sundayWorked", width: 13 },
      { header: "Holiday Worked", key: "holidayWorked", width: 14 },
    ];
    s1.getRow(1).font = { bold: true };
    for (const row of sheet.rows) {
      const rowData: Record<string, string | number> = { employee: row.name, role: row.roleLabel, ...row.totals };
      for (const day of row.days) rowData[`d${day.day}`] = day.offDayWorked ? `${DAY_LABEL[day.status ?? ""] ?? "?"}*` : (DAY_LABEL[day.status ?? ""] ?? "—");
      s1.addRow(rowData);
    }

    // SHEET 2 — Employee Work Summary
    const s2 = workbook.addWorksheet("Employee Work Summary");
    s2.columns = [
      { header: "Employee", key: "employee", width: 26 },
      { header: "Role", key: "role", width: 16 },
      { header: "Present", key: "present", width: 9 },
      { header: "Absent", key: "absent", width: 9 },
      { header: "Late", key: "late", width: 7 },
      { header: "Leave", key: "onLeave", width: 8 },
      { header: "Week Off", key: "weekOff", width: 9 },
      { header: "Holiday", key: "holiday", width: 8 },
      { header: "Sunday Worked", key: "sundayWorked", width: 13 },
      { header: "Field Working Days", key: "fieldWorkingDays", width: 16 },
      { header: "Visits", key: "customerVisits", width: 9 },
      { header: "Productive Visits", key: "productiveVisits", width: 15 },
      { header: "No-Order Visits", key: "noOrderVisits", width: 14 },
      { header: "Orders", key: "orders", width: 8 },
      { header: "Sales Value", key: "salesValue", width: 13 },
      { header: "New Customers", key: "newCustomers", width: 13 },
      { header: "Photos", key: "photos", width: 8 },
    ];
    s2.getRow(1).font = { bold: true };
    const employeeIds = sheet.rows.map((r) => r.employeeId);
    const performanceByEmployee = await bulkEmployeeMonthlyPerformance(prisma, user.id, employeeIds, year, month);
    for (const row of sheet.rows) {
      const performance = performanceByEmployee.get(row.employeeId);
      s2.addRow({ employee: row.name, role: row.roleLabel, ...row.totals, ...performance });
    }

    // SHEET 3 — Daily Activity Detail (real events only, for days with any recorded activity)
    const s3 = workbook.addWorksheet("Daily Activity Detail");
    s3.columns = [
      { header: "Employee", key: "employee", width: 26 },
      { header: "Date", key: "date", width: 12 },
      { header: "Time", key: "time", width: 20 },
      { header: "Activity", key: "activity", width: 50 },
    ];
    s3.getRow(1).font = { bold: true };
    const timelinesByKey = await bulkMonthlyActivityTimelines(prisma, user.id, employeeIds, year, month);
    for (const row of sheet.rows) {
      for (const day of row.days) {
        if (day.status === null) continue; // not evaluated — nothing real to report
        const timeline = timelinesByKey.get(`${row.employeeId}|${day.day}`);
        if (!timeline || !timeline.hasAnyData) continue;
        for (const event of timeline.events) {
          s3.addRow({ employee: row.name, date: `${year}-${String(month).padStart(2, "0")}-${String(day.day).padStart(2, "0")}`, time: new Date(event.at).toLocaleTimeString("en-IN"), activity: event.label });
        }
      }
    }

    const buffer = await workbook.xlsx.writeBuffer();
    return new NextResponse(buffer as ArrayBuffer, {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="attendance-${year}-${String(month).padStart(2, "0")}.xlsx"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    return apiFailure(error, request);
  }
}
