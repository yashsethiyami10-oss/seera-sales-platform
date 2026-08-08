"use client";

/**
 * "Print Invoice" and "Export" — no PDF generation exists anywhere in this
 * codebase (confirmed: lib/tax/invoice.ts produces structured data only, by
 * its own documented design, meant to feed a future PDF renderer). Rather
 * than fabricate a button that claims to produce a PDF, this uses the
 * browser's real print dialog (genuinely renders the on-screen invoice) and
 * a real client-side CSV download built from the same real invoice data
 * already shown on the page — both actually work, neither pretends to be
 * more than it is.
 */
export function OrderPrintExportActions({ orderNumber, csvRows }: { orderNumber: string; csvRows: string[][] }) {
  function handleExportCsv() {
    const csv = csvRows.map((row) => row.map((cell) => `"${cell.replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `invoice-${orderNumber}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="flex items-center gap-3 print:hidden">
      <button onClick={() => window.print()} className="muv-btn-ghost">Print Invoice</button>
      <button onClick={handleExportCsv} className="muv-btn-ghost">Export CSV</button>
    </div>
  );
}
