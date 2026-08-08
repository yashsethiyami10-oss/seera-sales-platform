"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { quickCustomerSearch } from "@/actions/inst-dashboards";

type Result = { id: string; name: string; businessName: string | null; phone: string | null; city: string | null };

export function QuickCustomerSearch() {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<Result[]>([]);
  const [isPending, startTransition] = useTransition();

  function onChange(value: string) {
    setQ(value);
    if (value.trim().length < 2) { setResults([]); return; }
    startTransition(async () => {
      const result = await quickCustomerSearch(value);
      setResults(result.success ? result.data : []);
    });
  }

  return (
    <div>
      <input
        value={q}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Search customers by name, company, or phone…"
        className="muv-os-field rounded-lg px-3 py-2 text-sm bg-transparent w-full"
        style={{ border: "1px solid var(--card-border)", color: "rgba(var(--text-rgb),0.9)" }}
      />
      {isPending && <p className="mt-1 text-xs" style={{ color: "rgba(var(--text-rgb),0.4)" }}>Searching…</p>}
      {results.length > 0 && (
        <div className="mt-2 space-y-1">
          {results.map((c) => (
            <Link key={c.id} href={`/os/customers/${c.id}`} className="muv-os-interactive flex items-center justify-between rounded-lg px-2 py-1.5 text-sm">
              <span style={{ color: "rgba(var(--text-rgb),0.85)" }}>{c.name}{c.businessName ? ` — ${c.businessName}` : ""}</span>
              <span style={{ color: "rgba(var(--text-rgb),0.5)" }}>{c.phone}</span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
