"use client";

import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { useState, useTransition } from "react";
import { Search } from "lucide-react";

/** MUV OS™ — Milestone 2 refinement, Employee Master readability — search by name/email. */
export function EmployeeSearch() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [q, setQ] = useState(searchParams.get("q") ?? "");
  const [, startTransition] = useTransition();

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const next = new URLSearchParams(searchParams.toString());
    if (q) next.set("q", q);
    else next.delete("q");
    next.delete("page");
    startTransition(() => router.push(`${pathname}?${next.toString()}`));
  }

  return (
    <form onSubmit={onSubmit} className="max-w-sm">
      <label className="muv-os-field-wrap flex items-center gap-2 rounded-lg px-3 py-2" style={{ border: "1px solid var(--card-border)", transition: "border-color 120ms ease-out, box-shadow 120ms ease-out" }}>
        <Search size={14} style={{ color: "rgba(var(--text-rgb),0.45)" }} />
        <span className="sr-only">Search employees</span>
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search name or email…"
          className="w-full bg-transparent text-sm outline-none"
          style={{ color: "rgba(var(--text-rgb),0.85)" }}
        />
      </label>
    </form>
  );
}
