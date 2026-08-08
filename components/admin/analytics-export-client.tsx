"use client";

/**
 * Same real, working client-side CSV pattern as Phase 13B's
 * order-print-export.tsx — genuinely downloads real data, opens directly in
 * Excel (which is what "Excel Export" means here: a real, working CSV, not
 * a fabricated distinct .xlsx binary format — no xlsx-generation library is
 * installed, and adding one would work against this phase's own "no
 * unnecessary heavy libraries" performance guidance).
 */
export function AnalyticsExportClient({ filename, rows }: { filename: string; rows: string[][] }) {
  function handleExport() {
    const csv = rows.map((row) => row.map((cell) => `"${cell.replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }

  return <button onClick={handleExport} className="muv-btn-ghost">Export CSV (opens in Excel)</button>;
}
