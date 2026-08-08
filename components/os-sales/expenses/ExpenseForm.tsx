"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { submitExpense } from "@/actions/inst-expenses";
import { useToast } from "@/components/ui/toast";

const CATEGORIES = ["FUEL", "PARKING", "TOLL", "HOTEL", "FOOD", "OTHER"];

export function ExpenseForm() {
  const router = useRouter();
  const { showToast } = useToast();
  const [saving, setSaving] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSaving(true);
    const form = new FormData(e.currentTarget);
    const result = await submitExpense({
      category: String(form.get("category")), amount: Number(form.get("amount")),
      expenseDate: String(form.get("expenseDate")), description: String(form.get("description") ?? "") || undefined,
    });
    setSaving(false);
    if (!result.success) { showToast(result.error.message, { tone: "dark" }); return; }
    showToast("Expense submitted", { tone: "dark" });
    (e.target as HTMLFormElement).reset();
    router.refresh();
  }

  const field = "muv-os-field rounded-lg px-3 py-2 text-sm bg-transparent";
  const fieldStyle = { border: "1px solid var(--card-border)", color: "rgba(var(--text-rgb),0.9)" } as const;

  return (
    <form onSubmit={onSubmit} className="flex flex-wrap items-end gap-2">
      <select name="category" defaultValue="FUEL" className={field} style={fieldStyle}>{CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}</select>
      <input type="number" min={0} step="0.01" name="amount" required placeholder="Amount ₹" className={field} style={fieldStyle} />
      <input type="date" name="expenseDate" required defaultValue={new Date().toISOString().slice(0, 10)} className={field} style={fieldStyle} />
      <input name="description" placeholder="Description…" className={field} style={{ ...fieldStyle, minWidth: 180 }} />
      <button type="submit" disabled={saving} className="muv-os-btn-primary rounded-lg px-3 py-2 text-sm font-medium disabled:opacity-60" style={{ background: "var(--lavender)", color: "#0b0b0f" }}>{saving ? "Submitting…" : "Submit"}</button>
    </form>
  );
}
