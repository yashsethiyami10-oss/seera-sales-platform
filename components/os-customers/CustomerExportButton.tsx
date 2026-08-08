"use client";

import { useState } from "react";
import { Download } from "lucide-react";
import { exportCustomersCsv } from "@/actions/customers";

/**
 * MUV OS™ — Milestone 2, Global Features "Export Foundation" — real,
 * working CSV download (via `lib/import-export/csv.ts`'s `toCSV`, wired
 * through `exportCustomersCsv`), not a placeholder button.
 */
export function CustomerExportButton({ searchParams }: { searchParams: Record<string, string | undefined> }) {
  const [loading, setLoading] = useState(false);

  async function handleExport() {
    setLoading(true);
    const result = await exportCustomersCsv({
      q: searchParams.q || undefined,
      active: searchParams.active === "false" ? false : searchParams.active === "true" ? true : undefined,
    });
    setLoading(false);
    if (!result.success) return;

    const blob = new Blob([result.data.csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `customers-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <button
      type="button"
      onClick={handleExport}
      disabled={loading}
      className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm"
      style={{ border: "1px solid var(--card-border)", color: "rgba(var(--text-rgb),0.75)" }}
    >
      <Download size={14} /> {loading ? "Exporting…" : "Export"}
    </button>
  );
}
