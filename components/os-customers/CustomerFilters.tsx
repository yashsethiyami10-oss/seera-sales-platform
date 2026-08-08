"use client";

import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { useState, useTransition } from "react";
import { Search } from "lucide-react";

/**
 * MUV OS™ — Milestone 2, Customer Master list "Search / Filters / Sorting"
 * (Global Features). URL-driven (search params), so filters are
 * shareable/back-button-able — the same principle the Global Layout
 * Specification already applied to shell UI state.
 */
export function CustomerFilters({
  customerTypes,
  institutionCategories,
}: {
  customerTypes: { id: string; name: string }[];
  institutionCategories: { id: string; name: string }[];
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [q, setQ] = useState(searchParams.get("q") ?? "");
  const [, startTransition] = useTransition();

  function updateParam(key: string, value: string) {
    const next = new URLSearchParams(searchParams.toString());
    if (value) next.set(key, value);
    else next.delete(key);
    next.delete("page");
    startTransition(() => router.push(`${pathname}?${next.toString()}`));
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    updateParam("q", q);
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-wrap items-center gap-2">
      <label className="muv-os-field-wrap flex items-center gap-2 rounded-lg px-3 py-2 flex-1 min-w-[220px]" style={{ border: "1px solid var(--card-border)", transition: "border-color 120ms ease-out, box-shadow 120ms ease-out" }}>
        <Search size={14} style={{ color: "rgba(var(--text-rgb),0.45)" }} />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search name, code, phone, email, GST…"
          className="w-full bg-transparent text-sm outline-none"
          style={{ color: "rgba(var(--text-rgb),0.85)" }}
        />
      </label>

      <select
        defaultValue={searchParams.get("customerTypeId") ?? ""}
        onChange={(e) => updateParam("customerTypeId", e.target.value)}
        className="muv-os-field rounded-lg px-3 py-2 text-sm bg-transparent"
        style={{ border: "1px solid var(--card-border)", color: "rgba(var(--text-rgb),0.75)" }}
      >
        <option value="">All types</option>
        {customerTypes.map((t) => (
          <option key={t.id} value={t.id}>{t.name}</option>
        ))}
      </select>

      <select
        defaultValue={searchParams.get("institutionCategoryId") ?? ""}
        onChange={(e) => updateParam("institutionCategoryId", e.target.value)}
        className="muv-os-field rounded-lg px-3 py-2 text-sm bg-transparent"
        style={{ border: "1px solid var(--card-border)", color: "rgba(var(--text-rgb),0.75)" }}
      >
        <option value="">All institution categories</option>
        {institutionCategories.map((c) => (
          <option key={c.id} value={c.id}>{c.name}</option>
        ))}
      </select>

      <select
        defaultValue={searchParams.get("active") ?? ""}
        onChange={(e) => updateParam("active", e.target.value)}
        className="muv-os-field rounded-lg px-3 py-2 text-sm bg-transparent"
        style={{ border: "1px solid var(--card-border)", color: "rgba(var(--text-rgb),0.75)" }}
      >
        <option value="">All statuses</option>
        <option value="true">Active only</option>
        <option value="false">Inactive only</option>
      </select>

      <select
        defaultValue={searchParams.get("sortBy") ?? "createdAt"}
        onChange={(e) => updateParam("sortBy", e.target.value)}
        className="muv-os-field rounded-lg px-3 py-2 text-sm bg-transparent"
        style={{ border: "1px solid var(--card-border)", color: "rgba(var(--text-rgb),0.75)" }}
      >
        <option value="createdAt">Newest first</option>
        <option value="name">Name</option>
        <option value="customerSince">Customer since</option>
        <option value="creditLimit">Credit limit</option>
      </select>
    </form>
  );
}
