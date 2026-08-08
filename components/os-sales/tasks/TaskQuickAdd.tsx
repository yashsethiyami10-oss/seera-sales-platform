"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createTask } from "@/actions/inst-tasks";
import { useToast } from "@/components/ui/toast";

const TYPES = ["PERSONAL", "ASSIGNED", "FOLLOWUP", "DAILY"];

export function TaskQuickAdd() {
  const router = useRouter();
  const { showToast } = useToast();
  const [saving, setSaving] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSaving(true);
    const form = new FormData(e.currentTarget);
    const result = await createTask({
      title: String(form.get("title")), type: String(form.get("type")),
      dueDate: form.get("dueDate") ? String(form.get("dueDate")) : undefined,
      priority: String(form.get("priority")),
    });
    setSaving(false);
    if (!result.success) { showToast(result.error.message, { tone: "dark" }); return; }
    showToast("Task added", { tone: "dark" });
    (e.target as HTMLFormElement).reset();
    router.refresh();
  }

  const field = "muv-os-field rounded-lg px-3 py-2 text-sm bg-transparent";
  const fieldStyle = { border: "1px solid var(--card-border)", color: "rgba(var(--text-rgb),0.9)" } as const;

  return (
    <form onSubmit={onSubmit} className="flex flex-wrap items-end gap-2">
      <input name="title" required placeholder="Task title…" className={field} style={{ ...fieldStyle, minWidth: 220 }} />
      <select name="type" defaultValue="PERSONAL" className={field} style={fieldStyle}>{TYPES.map((t) => <option key={t} value={t}>{t}</option>)}</select>
      <select name="priority" defaultValue="MEDIUM" className={field} style={fieldStyle}>{["LOW", "MEDIUM", "HIGH", "URGENT"].map((p) => <option key={p} value={p}>{p}</option>)}</select>
      <input type="date" name="dueDate" className={field} style={fieldStyle} />
      <button type="submit" disabled={saving} className="muv-os-btn-primary rounded-lg px-3 py-2 text-sm font-medium disabled:opacity-60" style={{ background: "var(--lavender)", color: "#0b0b0f" }}>{saving ? "Adding…" : "Add Task"}</button>
    </form>
  );
}
